import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';

// Récupération des clés secrètes depuis l'environnement GitHub
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Configuration du client Supabase
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

async function runScraper() {
  console.log("Démarrage du robot en mode Instant League...");
  
  // Lancement du navigateur en mode furtif pour contourner les freezes
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });
  
  const page = await browser.newPage();
  
  // Masquage du robot en simulant un vrai navigateur Chrome sur Windows
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    console.log("Navigation vers Bet261...");
    // On attend le chargement initial du DOM
    await page.goto('https://www.bet261.mg/', { waitUntil: 'domcontentloaded', timeout: 50000 });

    console.log("Attente de l'apparition des éléments de l'Instant League (10s)...");
    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log("Extraction des données réelles de l'Instant League...");
    const matches = await page.evaluate(() => {
      // Cible toutes les lignes de résultats dans le bloc principal trouvé via F12
      const rows = document.querySelectorAll('hg-instant-league-results .match-results > div'); 
      const results = [];
      
      // Extraction dynamique du nom ou numéro de la journée active
      const journeeElement = document.querySelector('hg-instant-league-results div.title, hg-instant-league-results .header-title, hg-instant-league-results .title');
      const journeeTexte = journeeElement ? journeeElement.innerText.trim() : "Instant League";

      rows.forEach(row => {
        // Extraction des équipes en suivant l'arborescence exacte de ton F12
        const dom = row.querySelector('.left-team.column .team')?.innerText.trim();
        const ext = row.querySelector('.right-team.column .team')?.innerText.trim();
        
        // Extraction du score central (généralement dans la colonne du milieu)
        const scoreTexte = row.querySelector('.center-team.column')?.innerText.trim() || 
                           row.querySelector('.score-column')?.innerText.trim() || 
                           row.querySelector('.score')?.innerText.trim();
        
        if (dom && ext && scoreTexte) {
          // Découpe le texte du score (ex: "3 - 1" ou "3:1") pour obtenir les deux nombres séparés
          const scores = scoreTexte.split(/[-:]+/).map(s => parseInt(s.trim(), 10));
          
          if (scores.length === 2 && !isNaN(scores[0]) && !isNaN(scores[1])) {
            results.push({ 
              journee: journeeTexte, 
              equipe_dom: dom, 
              equipe_ext: ext, 
              score_dom: scores[0], 
              score_ext: scores[1] 
            });
          }
        }
      });
      return results;
    });

    console.log(`Analyse terminée. Matchs trouvés valides : ${matches.length}`);

    if (matches.length > 0) {
      console.log("Envoi des données vers ta table Supabase...");
      const { error } = await supabase
        .from('historique_virtuel')
        .upsert(matches, { onConflict: 'journee,equipe_dom,equipe_ext' });

      if (error) throw error;
      console.log("Félicitations, les données sont synchronisées avec Supabase !");
    } else {
      console.log("Aucun match extrait. La page n'était pas entièrement chargée ou le jeu utilise une iframe externe.");
    }

  } catch (err) {
    console.error("Erreur durant l'exécution :", err.message);
  } finally {
    await browser.close();
    console.log("Navigateur fermé. Fin de la session.");
  }
}

runScraper();
