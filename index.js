import { createClient } from '@supabase/supabase-js';

// 1. Configuration de TON Supabase (où tu stockes tes données)
const monSupabaseUrl = process.env.SUPABASE_URL;
const monSupabaseKey = process.env.SUPABASE_KEY;
const monSupabase = createClient(monSupabaseUrl, monSupabaseKey, {
  auth: { persistSession: false }
});

// 2. Configuration du Supabase source de Bet261 (que tu as intercepté)
const bet261SupabaseUrl = 'https://msgjnpqkciigvbpgbppe.supabase.co';
const bet261ApiKey = 'sb_publishable_wTqgB5cIxYYx_V6Uv238JA_eaGlFb7N';
const bet261Supabase = createClient(bet261SupabaseUrl, bet261ApiKey, {
  auth: { persistSession: false }
});

async function runScraper() {
  console.log("Démarrage du robot en mode interception API Directe...");

  try {
    console.log("Récupération des derniers matchs depuis la source Bet261...");
    
    // On va chercher les 20 derniers résultats enregistrés sur leur table officielle
    const { data: sourceMatches, error: fetchError } = await bet261Supabase
      .from('english_league_historique')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (fetchError) throw fetchError;

    if (sourceMatches && sourceMatches.length > 0) {
      console.log(`${sourceMatches.length} matchs récupérés de l'API. Adaptation pour ta base de données...`);

      // On formate les données reçues pour correspondre aux colonnes de TA table historique_virtuel
      const matchesPourMaTable = sourceMatches.map(match => ({
        journee: match.journee?.toString() || "Instant League",
        equipe_dom: match.home_team || match.home,
        equipe_ext: match.away_team || match.away,
        score_dom: parseInt(match.home_score ?? match.score_home, 10) || 0,
        score_ext: parseInt(match.away_score ?? match.score_away, 10) || 0,
        // Si leur table fournit les cotes, on essaie de les mapper, sinon on laisse null
        cote_dom: match.cote_home || match.odds_home || null,
        cote_nul: match.cote_draw || match.odds_draw || null,
        cote_ext: match.cote_away || match.odds_away || null
      }));

      console.log("Envoi des données vers ton Supabase...");
      const { error: insertError } = await monSupabase
        .from('historique_virtuel')
        .upsert(matchesPourMaTable, { onConflict: 'journee,equipe_dom,equipe_ext' });

      if (insertError) throw insertError;
      console.log("🔥 Succès total ! Ta base de données vient d'être mise à jour directement depuis la source !");
    } else {
      console.log("Aucune donnée trouvée sur la table source pour le moment.");
    }

  } catch (err) {
    console.error("Erreur d'interception de l'API :", err.message);
  } finally {
    console.log("Fin du job.");
  }
}

runScraper();
