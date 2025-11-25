import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting street geometries update...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all existing streets
    const { data: existingStreets, error: fetchError } = await supabase
      .from('streets')
      .select('id, name, type, coordinates');

    if (fetchError) {
      console.error('Error fetching streets:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${existingStreets.length} streets in database`);

    // Overpass query limited to the Portes-lès-Valence commune using INSEE code 26252
    const overpassQuery = `
      [out:json][timeout:120];
      area["ref:INSEE"="26252"]->.searchArea;
      (
        way["highway"]["name"](area.searchArea);
      );
      out geom;
    `;

    console.log('Fetching data from OpenStreetMap...');
    const overpassResponse = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: overpassQuery,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (!overpassResponse.ok) {
      throw new Error(`Overpass API error: ${overpassResponse.status}`);
    }

    const osmData = await overpassResponse.json();
    console.log(`Received ${osmData.elements.length} ways from OSM`);

    let updatedCount = 0;
    let skippedCount = 0;
    let filteredCount = 0;

    // Strict bounding box for Portes-lès-Valence (excluding Ardèche on the other side of Rhône)
    // These coordinates are tighter to avoid capturing streets in Ardèche
    const BBOX = {
      minLat: 44.84,
      maxLat: 44.90,
      minLon: 4.85,
      maxLon: 4.92
    };

    // Function to check if a coordinate is within strict bounds
    const isInBounds = (lat: number, lon: number) => {
      return lat >= BBOX.minLat && lat <= BBOX.maxLat && 
             lon >= BBOX.minLon && lon <= BBOX.maxLon;
    };

    // Build a map of street name -> array of ways (each way is a separate segment)
    const streetGeometries = new Map<string, number[][][]>();

    for (const element of osmData.elements) {
      if (!element.tags?.name || !element.geometry) {
        continue;
      }

      const streetName = element.tags.name as string;
      const key = streetName.trim().toLowerCase();

      // Parse geometry - element.geometry is an array of {lat, lon}
      const coordinates = element.geometry.map((node: any) => [node.lat, node.lon]);

      if (coordinates.length === 0) {
        console.log(`No coordinates for ${streetName}, skipping element`);
        skippedCount++;
        continue;
      }

      // Filter out coordinates that are outside the strict bounding box
      // This removes streets on the Ardèche side of the Rhône
      const allPointsInBounds = coordinates.every((coord: number[]) => isInBounds(coord[0], coord[1]));
      
      if (!allPointsInBounds) {
        // Check if at least 50% of points are in bounds before filtering
        const pointsInBounds = coordinates.filter((coord: number[]) => isInBounds(coord[0], coord[1]));
        if (pointsInBounds.length < coordinates.length * 0.5) {
          console.log(`Filtering out ${streetName} - mostly outside Portes-lès-Valence bounds`);
          filteredCount++;
          continue;
        }
        // Keep only the points within bounds
        coordinates.splice(0, coordinates.length, ...pointsInBounds);
      }

      // Keep each OSM way as a separate segment to avoid connecting non-contiguous parts
      const existingWays = streetGeometries.get(key) ?? [];
      existingWays.push(coordinates);
      streetGeometries.set(key, existingWays);
    }

    console.log(`Built geometries for ${streetGeometries.size} distinct street names`);

    // Now update existing streets using the segmented geometries (case-insensitive match)
    for (const s of existingStreets) {
      const key = s.name.trim().toLowerCase();
      const ways = streetGeometries.get(key);

      if (!ways || ways.length === 0) {
        skippedCount++;
        continue;
      }

      // Store as MultiLineString format (array of ways)
      const totalPoints = ways.reduce((sum, way) => sum + way.length, 0);

      const { error: updateError } = await supabase
        .from('streets')
        .update({ coordinates: ways })
        .eq('id', s.id);

      if (updateError) {
        console.error(`Error updating ${s.name}:`, updateError);
      } else {
        console.log(`✓ Updated ${s.name} with ${ways.length} segment(s) (${totalPoints} points total)`);
        updatedCount++;
      }
    }

    console.log(`Update complete: ${updatedCount} updated, ${skippedCount} skipped, ${filteredCount} filtered out (outside bounds)`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Geometries updated successfully',
        stats: {
          totalStreets: existingStreets.length,
          osmWays: osmData.elements.length,
          updated: updatedCount,
          skipped: skippedCount,
          filtered: filteredCount
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in update-street-geometries:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: 'Failed to update street geometries'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
