import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

async function runScraper() {
  console.log("Démarrage du robot avec gestion des iframes...");
  
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

    console.log("Recherche de l'iframe du jeu virtuel...");
    // On attend que la page charge ses composants
    await new Promise(resolve => setTimeout(resolve, 12000));

    // Trouver toutes les iframes de la page
    const frames = page.frames();
    // On cherche l'iframe qui contient le jeu (souvent liée à hg-root ou virtual)
    const gameFrame = frames.find(f => f.url().includes('virtual') || f.name().includes('virtual') || frames.indexOf(f) > 0);

    let targetContext = page; // Par défaut, on cherche sur la page principale
    if (gameFrame) {
      console.log(`Iframe détectée ! Passage dans le contexte : ${gameFrame.url().substring(0, 40)}...`);
      targetContext = gameFrame; // On bascule le robot à l'intérieur de la fenêtre de jeu
    } else {
      console.log("Aucune iframe distincte trouvée, tentative sur la page principale.");
    }

    console.log("Extraction des données de l'Instant League...");
    const matches = await targetContext.evaluate(() => {
      const rows = document.querySelectorAll('hg-instant-league-results .match-results > div, .match-results > div'); 
      const results = [];
      
      const journeeElement = document.querySelector('hg-instant-league-results div.title, .title, .header-title');
      const journeeTexte = journeeElement ? journeeElement.innerText.trim() : "Instant League";

      rows.forEach(row => {
        const dom = row.querySelector('.left-team.column .team, .left-team .team')?.innerText.trim();
        const ext = row.querySelector('.right-team.column .team, .right-team .team')?.innerText.trim();
        const scoreTexte = row.querySelector('.center-team.column')?.innerText.trim() || 
                           row.querySelector('.score')?.innerText.trim();
        
        if (dom && ext && scoreTexte) {
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

    console.log(`Analyse terminée. Matchs valides trouvés : ${matches.length}`);

    if (matches.length > 0) {
      console.log("Envoi des données vers Supabase...");
      const { error } = await supabase
        .from('historique_virtuel')
        .upsert(matches, { onConflict: 'journee,equipe_dom,equipe_ext' });

      if (error) throw error;
      console.log("Synchronisation réussie !");
    } else {
      console.log("Le tableau reste introuvable. Si le problème persiste, il faudra inspecter l'URL directe de l'iframe réseau.");
    }

  } catch (err) {
    console.error("Erreur :", err.message);
  } finally {
    await browser.close();
    console.log("Fin du job.");
  }
}

runScraper();
