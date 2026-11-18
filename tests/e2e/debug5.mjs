import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']});
const p=await b.newPage(); await p.setViewport({width:390,height:844,isMobile:true});
await p.goto('http://127.0.0.1:8081/',{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,2000));
console.log(await p.evaluate(()=>({hidden:document.querySelector('#mapFallback').hidden,text:document.querySelector('#mapFallbackText').textContent,mapDisplay:document.querySelector('#map').style.display,ready:MapBox.ready,failed:MapBox.failed})));
await b.close();
