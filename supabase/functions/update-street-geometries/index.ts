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

    // Overpass query with expanded bounding box and all highway types
    const overpassQuery = `
      [out:json][timeout:120];
      (
        way["highway"]["name"](44.84,4.83,44.92,4.94);
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

    for (const element of osmData.elements) {
      if (!element.tags?.name || !element.geometry) {
        continue;
      }

      const streetName = element.tags.name;
      
      // Parse geometry - element.geometry is an array of {lat, lon}
      const coordinates = element.geometry.map((node: any) => [node.lat, node.lon]);

      if (coordinates.length === 0) {
        console.log(`No coordinates for ${streetName}, skipping`);
        skippedCount++;
        continue;
      }

      // Find matching street in database
      const matchingStreet = existingStreets.find(s => 
        s.name.toLowerCase() === streetName.toLowerCase()
      );

      if (matchingStreet) {
        // Update with full geometry
        const { error: updateError } = await supabase
          .from('streets')
          .update({ coordinates })
          .eq('id', matchingStreet.id);

        if (updateError) {
          console.error(`Error updating ${streetName}:`, updateError);
        } else {
          console.log(`✓ Updated ${streetName} with ${coordinates.length} points`);
          updatedCount++;
        }
      } else {
        skippedCount++;
      }
    }

    console.log(`Update complete: ${updatedCount} updated, ${skippedCount} skipped`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Geometries updated successfully',
        stats: {
          totalStreets: existingStreets.length,
          osmWays: osmData.elements.length,
          updated: updatedCount,
          skipped: skippedCount
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
