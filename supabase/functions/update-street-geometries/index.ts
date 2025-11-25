import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Starting geometry update for streets')
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Get streets with only centroid (single point)
    const { data: streets } = await supabase
      .from('streets')
      .select('id, name, coordinates')
    
    const streetsToUpdate = streets?.filter(s => 
      s.coordinates && Array.isArray(s.coordinates) && s.coordinates.length === 1
    ) || []
    
    console.log(`Found ${streetsToUpdate.length} streets with centroid only`)
    
    const results = {
      updated: 0,
      failed: 0,
      total: streetsToUpdate.length
    }
    
    // Process streets in batches
    for (const street of streetsToUpdate) {
      try {
        console.log(`Processing: ${street.name}`)
        
        // Query Overpass for this specific street
        const overpassQuery = `
          [out:json][timeout:30];
          way["highway"]["name"="${street.name.replace(/"/g, '\\"')}"](44.84,4.83,44.91,4.93);
          out geom;
        `
        
        const response = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          body: `data=${encodeURIComponent(overpassQuery)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        })
        
        if (!response.ok) {
          console.error(`Overpass error for ${street.name}:`, response.statusText)
          results.failed++
          continue
        }
        
        const data = await response.json()
        
        if (data.elements && data.elements.length > 0) {
          const element = data.elements[0]
          let coordinates: number[][] = []
          
          if (element.geometry && Array.isArray(element.geometry)) {
            coordinates = element.geometry.map((node: any) => [node.lat, node.lon])
          }
          
          if (coordinates.length > 1) {
            await supabase
              .from('streets')
              .update({ coordinates })
              .eq('id', street.id)
            
            results.updated++
            console.log(`✓ Updated ${street.name} with ${coordinates.length} points`)
          } else {
            results.failed++
          }
        } else {
          results.failed++
        }
        
        // Rate limiting: wait 1 second between requests
        await new Promise(resolve => setTimeout(resolve, 1000))
        
      } catch (error) {
        console.error(`Error processing ${street.name}:`, error)
        results.failed++
      }
    }
    
    console.log('Geometry update results:', results)
    
    return new Response(
      JSON.stringify(results),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
    
  } catch (error) {
    console.error('Geometry update error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
