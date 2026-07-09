import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';

// Récupération des clés secrètes depuis l'environnement GitHub
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Configuration du client Supabase sans Realtime pour éviter les bugs de WebSocket
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  realtime: { timeout: 10000 }
});

async function runScraper() {
  console.log("Démarrage du robot...");
  
  // Lancement du navigateur virtuel dans l'environnement Linux de GitHub
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  try {
    console.log("Navigation vers Bet261...");
    // Navigation vers le site officiel
    await page.goto('https://www.bet261.mg/', { waitUntil: 'networkidle2', timeout: 60000 });

    console.log("Extraction des données de l'historique...");
    // Extraction des scores (IMPORTANT: Pense à vérifier/adapter ces classes CSS si le site change)
    const matches = await page.evaluate(() => {
      const rows = document.querySelectorAll('.classe-historique-match'); // À remplacer par la vraie classe du tableau
      const results = [];
      
      rows.forEach(row => {
        const journee = row.querySelector('.classe-journee')?.innerText.trim();
        const dom = row.querySelector('.classe-equipe-dom')?.innerText.trim();
        const ext = row.querySelector('.classe-equipe-ext')?.innerText.trim();
        const sDom = parseInt(row.querySelector('.classe-score-dom')?.innerText.trim(), 10);
        const sExt = parseInt(row.querySelector('.classe-score-ext')?.innerText.trim(), 10);

        if (dom && ext && !isNaN(sDom) && !isNaN(sExt)) {
          results.push({ 
            journee, 
            equipe_dom: dom, 
            equipe_ext: ext, 
            score_dom: sDom, 
            score_ext: sExt 
          });
        }
      });
      return results;
    });

    console.log(`${matches.length} matchs structurés trouvés.`);

    if (matches.length > 0) {
      console.log("Envoi des données vers ta table Supabase...");
      // Upsert permet d'insérer les nouveaux matchs et d'ignorer ceux déjà existants
      const { error } = await supabase
        .from('historique_virtuel')
        .upsert(matches, { onConflict: 'journee,equipe_dom,equipe_ext' });

      if (error) throw error;
      console.log("Données synchronisées avec succès dans Supabase !");
    } else {
      console.log("Aucun match trouvé. Vérifie si les sélecteurs CSS dans le code correspondent toujours au site.");
    }

  } catch (err) {
    console.error("Erreur durant l'exécution du robot :", err.message);
  } finally {
    await browser.close();
    console.log("Navigateur fermé. Fin du job.");
  }
}

runScraper();
