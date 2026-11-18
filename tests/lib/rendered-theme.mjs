import assert from 'node:assert/strict';
/** Exercise the actual ThemeService controls, including its published-token bridge. */
export async function renderedTheme(page,theme){
 const toggle=page.getByRole('button',{name:theme==='dark'?'Dark theme':'Light theme',exact:true});
 if(await toggle.count())await toggle.click();else{await page.evaluate(theme=>localStorage.setItem('skyra-theme',theme),theme);await page.reload();}
 await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await Promise.all(document.getAnimations().filter(a=>a.effect&&Number.isFinite(a.effect.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})));});
 const value=await page.evaluate(()=>({theme:document.documentElement.dataset.theme,dark:document.documentElement.classList.contains('dark'),background:getComputedStyle(document.documentElement).getPropertyValue('--skyra-bg').trim().toLowerCase()}));
 assert.equal(value.theme,theme);assert.equal(value.dark,theme==='dark');assert.equal(value.background,theme==='dark'?'#0b111e':'#f4f7fc');return value;
}
