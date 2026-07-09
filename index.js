import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';

// Configuration de ta base Supabase (on va lier les variables d'environnement)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runScraper() {
  console.log("Démarrage du robot...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  try {
    // 1. Navigation vers le site
    await page.goto('https://www.bet261.mg/', { waitUntil: 'networkidle2' });

    // 2. Extraction des données (Sélecteurs CSS à adapter selon le site)
    const matches = await page.evaluate(() => {
      const rows = document.querySelectorAll('.classe-historique-match'); // À MODIFIER
      const results = [];
      
      rows.forEach(row => {
        const journee = row.querySelector('.classe-journee')?.innerText.trim();
        const dom = row.querySelector('.classe-equipe-dom')?.innerText.trim();
        const ext = row.querySelector('.classe-equipe-ext')?.innerText.trim();
        const sDom = parseInt(row.querySelector('.classe-score-dom')?.innerText.trim(), 10);
        const sExt = parseInt(row.querySelector('.classe-score-ext')?.innerText.trim(), 10);

        if (dom && ext && !isNaN(sDom)) {
          results.push({ journee, equipe_dom: dom, equipe_ext: ext, score_dom: sDom, score_ext: sExt });
        }
      });
      return results;
    });

    console.log(`${matches.length} matchs trouvés. Envoi vers Supabase...`);

    // 3. Insertion dans Supabase (grâce à la contrainte unique, les doublons seront ignorés)
    const { error } = await supabase.from('historique_virtuel').upsert(matches, { onConflict: 'journee,equipe_dom,equipe_ext' });

    if (error) throw error;
    console.log("Données synchronisées avec succès !");

  } catch (err) {
    console.error("Erreur :", err.message);
  } finally {
    await browser.close();
  }
}

runScraper();
