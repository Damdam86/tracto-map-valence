import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BBOX = {
  minLat: 44.865,
  maxLat: 44.885,
  minLon: 4.865,
  maxLon: 4.895,
};

const isInBounds = (lat: number, lon: number) => {
  return lat >= BBOX.minLat && lat <= BBOX.maxLat && lon >= BBOX.minLon && lon <= BBOX.maxLon;
};

const BBOX = {
  minLat: 44.865,
  maxLat: 44.885,
  minLon: 4.865,
  maxLon: 4.895
}

const isInBounds = (lat: number, lon: number) => {
  return lat >= BBOX.minLat && lat <= BBOX.maxLat &&
         lon >= BBOX.minLon && lon <= BBOX.maxLon
}

const BBOX = {
  minLat: 44.865,
  maxLat: 44.885,
  minLon: 4.865,
  maxLon: 4.895
}

const isInBounds = (lat: number, lon: number) => {
  return lat >= BBOX.minLat && lat <= BBOX.maxLat &&
         lon >= BBOX.minLon && lon <= BBOX.maxLon
}

const BBOX = {
  minLat: 44.865,
  maxLat: 44.885,
  minLon: 4.865,
  maxLon: 4.895
}

const isInBounds = (lat: number, lon: number) => {
  return lat >= BBOX.minLat && lat <= BBOX.maxLat &&
         lon >= BBOX.minLon && lon <= BBOX.maxLon
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting BAN import for Portes-lès-Valence (26252)");

    // Download BAN CSV for department 26 (Drôme)
    const banUrl = "https://adresse.data.gouv.fr/data/ban/adresses/latest/csv/adresses-26.csv.gz";
    console.log("Downloading BAN data from:", banUrl);

    const response = await fetch(banUrl);
    if (!response.ok) {
      throw new Error(`Failed to download BAN data: ${response.statusText}`);
    }

    // Decompress gzip
    const decompressed = response.body?.pipeThrough(new DecompressionStream("gzip"));
    if (!decompressed) {
      throw new Error("Failed to decompress data");
    }

    // Read and parse CSV
    const reader = decompressed.getReader();
    const decoder = new TextDecoder("utf-8");
    let csvData = "";
    let done = false;

    while (!done) {
      const { value, done: streamDone } = await reader.read();
      done = streamDone;
      if (value) {
        csvData += decoder.decode(value, { stream: !done });
      }
    }

    console.log("CSV data downloaded, parsing...");

    // Parse CSV and filter for Portes-lès-Valence (code INSEE: 26252)
    const lines = csvData.split("\n");
    const headers = lines[0].split(";"); // BAN CSV uses semicolon separator

    console.log("CSV headers:", headers.slice(0, 10).join(", "));

    // Find column indices
    const nomVoieIdx = headers.indexOf("nom_voie");
    const codeInseeIdx = headers.indexOf("code_insee");
    const latIdx = headers.indexOf("lat");
    const lonIdx = headers.indexOf("lon");

    console.log("Column indices:", { nomVoieIdx, codeInseeIdx, latIdx, lonIdx });

    // Group addresses by street name and calculate centroid
    const streetMap = new Map<string, { lats: number[]; lons: number[]; numbers: number[] }>();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line.trim()) continue
      
      const cols = line.split(';') // BAN CSV uses semicolon separator
      const codeInsee = cols[codeInseeIdx]
      
      if (codeInsee === '26252') {
        const nomVoie = cols[nomVoieIdx]
        const lat = parseFloat(cols[latIdx])
        const lon = parseFloat(cols[lonIdx])

        if (nomVoie && !isNaN(lat) && !isNaN(lon) && isInBounds(lat, lon)) {
          if (!streetMap.has(nomVoie)) {
            streetMap.set(nomVoie, { lats: [], lons: [], numbers: [] });
          }
          const street = streetMap.get(nomVoie)!
          street.lats.push(lat)
          street.lons.push(lon)

          // Extract house number if present
          const numeroCol = headers.indexOf("numero");
          if (numeroCol >= 0 && cols[numeroCol]) {
            const numero = parseInt(cols[numeroCol]);
            if (!isNaN(numero)) {
              street.numbers.push(numero);
            }
          }
        }
      }
    }

    console.log(`Found ${streetMap.size} streets in Portes-lès-Valence`);

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get existing streets
    const { data: existingStreets } = await supabase.from("streets").select("id, name");

    const existingNames = new Map(existingStreets?.map((s) => [s.name, s.id]) || []);

    const results = {
      imported: 0,
      updated: 0,
      skipped: 0,
      osmAdded: 0,
      total: streetMap.size,
    };

    // Process each street
    for (const [streetName, data] of streetMap.entries()) {
      const { lats, lons, numbers } = data

      if (lats.length === 0 || lons.length === 0) {
        results.skipped++
        continue
      }

      // Calculate centroid (average position of all addresses)
      const centroidLat = lats.reduce((sum, lat) => sum + lat, 0) / lats.length;
      const centroidLon = lons.reduce((sum, lon) => sum + lon, 0) / lons.length;
      const centroid = [[centroidLat, centroidLon]];

      // Determine street type from name
      const getStreetType = (name: string) => {
        const lower = name.toLowerCase();
        if (lower.includes("avenue") || lower.startsWith("av ")) return "avenue";
        if (lower.includes("boulevard") || lower.startsWith("bd ")) return "boulevard";
        if (lower.includes("impasse") || lower.startsWith("imp ")) return "impasse";
        if (lower.includes("place") || lower.startsWith("pl ")) return "place";
        if (lower.includes("chemin") || lower.startsWith("ch ")) return "chemin";
        if (lower.includes("route") || lower.startsWith("rte ")) return "route";
        return "street";
      };

      if (existingNames.has(streetName)) {
        // Update existing street with centroid coordinates
        const streetId = existingNames.get(streetName)!;
        const { error } = await supabase.from("streets").update({ coordinates: centroid }).eq("id", streetId);

        if (!error) {
          results.updated++;
        }
      } else {
        // Insert new street
        const { data: newStreet, error } = await supabase
          .from("streets")
          .insert({
            name: streetName,
            type: getStreetType(streetName),
            district: "Importé",
            neighborhood: "Base Adresse Nationale",
            coordinates: centroid,
          })
          .select()
          .single();

        if (!error && newStreet) {
          results.imported++;

          // Create segments
          const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 100;
          const segments = [];
          const segmentSize = 50;

          if (maxNumber <= segmentSize) {
            segments.push({
              street_id: newStreet.id,
              number_start: 1,
              number_end: maxNumber,
              side: "both",
              building_type: "mixed",
            });
          } else {
            for (let start = 1; start <= maxNumber; start += segmentSize) {
              const end = Math.min(start + segmentSize - 1, maxNumber);
              segments.push({
                street_id: newStreet.id,
                number_start: start,
                number_end: end,
                side: "both",
                building_type: "mixed",
              });
            }
          }

          await supabase.from("segments").insert(segments);
        } else {
          results.skipped++;
        }
      }
    }

    console.log("BAN import results:", results);

    // Now fetch streets from OpenStreetMap to complement BAN data
    console.log("Fetching complementary streets from OpenStreetMap...");

    // Élargi le bbox pour Portes-lès-Valence (44.876 +/- 0.03)
    const overpassQuery = `
      [out:json][timeout:90];
      (
        way["highway"~"^(residential|tertiary|secondary|primary|unclassified|service|living_street|pedestrian)$"]["name"](44.84,4.83,44.91,4.93);
      );
      out geom;
    `;

    const overpassResponse = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: `data=${encodeURIComponent(overpassQuery)}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (!overpassResponse.ok) {
      console.error("Overpass API error:", overpassResponse.statusText);
    } else {
      const osmData = await overpassResponse.json();
      console.log(`Found ${osmData.elements?.length || 0} streets in OpenStreetMap`);

      // Get current street names (after BAN import)
      const { data: currentStreets } = await supabase.from("streets").select("name");

      const currentNames = new Set(currentStreets?.map((s) => s.name) || []);

      let osmAdded = 0;

      for (const element of osmData.elements || []) {
        const streetName = element.tags?.name;
        if (!streetName) continue;

        // Parse full geometry from OSM
        let coordinates: number[][] = [];
        if (element.geometry && Array.isArray(element.geometry)) {
          coordinates = element.geometry.map((node: any) => [node.lat, node.lon]);
        } else if (element.center) {
          // Fallback to center if geometry not available
          coordinates = [[element.center.lat, element.center.lon]];
        }

        const filteredCoordinates = coordinates.filter((coord) => isInBounds(coord[0], coord[1]))

        if (filteredCoordinates.length === 0) continue

        coordinates = filteredCoordinates
        
        // If street exists, update it with full geometry
        if (currentNames.has(streetName)) {
          const { data: existingStreet } = await supabase
            .from("streets")
            .select("id, coordinates")
            .eq("name", streetName)
            .single();

          // Only update if current street has single point (centroid)
          if (existingStreet && existingStreet.coordinates && existingStreet.coordinates.length === 1) {
            await supabase.from("streets").update({ coordinates }).eq("id", existingStreet.id);
            results.updated++;
          }
          continue;
        }

        // Determine street type from name
        const getStreetType = (name: string) => {
          const lower = name.toLowerCase();
          if (lower.includes("avenue") || lower.startsWith("av ")) return "avenue";
          if (lower.includes("boulevard") || lower.startsWith("bd ")) return "boulevard";
          if (lower.includes("impasse") || lower.startsWith("imp ")) return "impasse";
          if (lower.includes("place") || lower.startsWith("pl ")) return "place";
          if (lower.includes("chemin") || lower.startsWith("ch ")) return "chemin";
          if (lower.includes("route") || lower.startsWith("rte ")) return "route";
          return "street";
        };

        const { data: newStreet, error } = await supabase
          .from("streets")
          .insert({
            name: streetName,
            type: getStreetType(streetName),
            district: "Importé",
            neighborhood: "OpenStreetMap",
            coordinates: coordinates,
          })
          .select()
          .single();

        if (!error && newStreet) {
          osmAdded++;
          currentNames.add(streetName);

          // Create a default segment
          await supabase.from("segments").insert({
            street_id: newStreet.id,
            number_start: 1,
            number_end: 100,
            side: "both",
            building_type: "mixed",
          });
        }
      }

      results.osmAdded = osmAdded;
      console.log(`Added ${osmAdded} streets from OpenStreetMap`);
    }

    console.log("Final import results:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Import error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
