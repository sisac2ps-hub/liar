const https = require('https');

https.get('https://darkorchid-anteater-429550.hostingersite.com/?cachebust=' + Date.now(), (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const match = data.match(/href="(\/assets\/index-[^\.]+\.css)"/);
    if (!match) {
      console.log("No CSS file found in HTML");
      return;
    }
    const cssUrl = 'https://darkorchid-anteater-429550.hostingersite.com' + match[1];
    console.log("Found CSS URL:", cssUrl);
    
    https.get(cssUrl, (res2) => {
      let cssData = '';
      res2.on('data', chunk => cssData += chunk);
      res2.on('end', () => {
        console.log("CSS file size:", cssData.length);
        console.log("Contains .bg-white?", cssData.includes('.bg-white'));
        console.log("Contains .text-cyan-400?", cssData.includes('.text-cyan-400'));
        console.log("Contains .glass-panel?", cssData.includes('.glass-panel'));
      });
    });
  });
}).on("error", (err) => {
  console.log("Error: " + err.message);
});
