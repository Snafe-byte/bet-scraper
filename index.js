import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

async function runScraper() {
  console.log("Démarrage du robot avec capture des scores et des cotes...");
  
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
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    console.log("Navigation vers Bet261...");
    await page.goto('https://www.bet261.mg/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log("Attente du chargement de l'iframe de l'Instant League...");
    await new Promise(resolve => setTimeout(resolve, 12000));

    const frames = page.frames();
    const gameFrame = frames.find(f => f.url().includes('virtual') || f.name().includes('virtual') || frames.indexOf(f) > 0);

    let targetContext = page; 
    if (gameFrame) {
      console.log("Bascule dans l'iframe du jeu.");
      targetContext = gameFrame;
    }

    console.log("Extraction des données (Matchs + Cotes)...");
    const matches = await targetContext.evaluate(() => {
      const rows = document.querySelectorAll('hg-instant-league-results .match-results > div, .match-results > div'); 
      const results = [];
      
      const journeeElement = document.querySelector('hg-instant-league-results div.title, .title, .header-title');
      const journeeTexte = journeeElement ? journeeElement.innerText.trim() : "Instant League";

      rows.forEach(row => {
        // 1. Extraction des équipes
        const dom = row.querySelector('.left-team.column .team, .left-team .team')?.innerText.trim();
        const ext = row.querySelector('.right-team.column .team, .right-team .team')?.innerText.trim();
        
        // 2. Extraction du Score
        const scoreTexte = row.querySelector('.center-team.column')?.innerText.trim() || 
                           row.querySelector('.score')?.innerText.trim();
        
        // 3. Extraction des Cotes (Recherche des boutons de paris 1, X, 2 de la ligne)
        // Souvent sous forme de liste de boutons .odds-button, .odd, ou .outcome
        const oddsElements = row.querySelectorAll('.odds-button, .odd, .outcome, .price');
        
        let cDom = null;
        let cNul = null;
        let cExt = null;

        if (oddsElements && oddsElements.length >= 3) {
          cDom = parseFloat(oddsElements[0].innerText.trim().replace(',', '.'));
          cNul = parseFloat(oddsElements[1].innerText.trim().replace(',', '.'));
          cExt = parseFloat(oddsElements[2].innerText.trim().replace(',', '.'));
        }

        if (dom && ext && scoreTexte) {
          const scores = scoreTexte.split(/[-:]+/).map(s => parseInt(s.trim(), 10));
          if (scores.length === 2 && !isNaN(scores[0]) && !isNaN(scores[1])) {
            results.push({ 
              journee: journeeTexte, 
              equipe_dom: dom, 
              equipe_ext: ext, 
              score_dom: scores[0], 
              score_ext: scores[1],
              cote_dom: isNaN(cDom) ? null : cDom,
              cote_nul: isNaN(cNul) ? null : cNul,
              cote_ext: isNaN(cExt) ? null : cExt
            });
          }
        }
      });
      return results;
    });

    console.log(`Matchs analysés : ${matches.length}`);

    if (matches.length > 0) {
      console.log("Envoi complet des scores et des cotes vers Supabase...");
      const { error } = await supabase
        .from('historique_virtuel')
        .upsert(matches, { onConflict: 'journee,equipe_dom,equipe_ext' });

      if (error) throw error;
      console.log("Base de données mise à jour avec succès !");
    } else {
      console.log("Aucun match extrait.");
    }

  } catch (err) {
    console.error("Erreur :", err.message);
  } finally {
    await browser.close();
    console.log("Fin de session.");
  }
}

runScraper();
