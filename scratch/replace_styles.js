const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'client', 'src', 'App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replacements map
const replacements = [
  // Backgrounds
  { from: 'bg-[#0d1321]/80', to: 'bg-white/90' },
  { from: 'bg-[#0d1421]/80', to: 'bg-white/90' },
  { from: 'bg-[#0d1421]', to: 'bg-slate-100' },
  { from: 'bg-[#0b0f19]/80', to: 'bg-white' },
  { from: 'bg-[#0b0f19]', to: 'bg-slate-50' },
  { from: 'bg-[#1a1c23]', to: 'bg-slate-100' },
  { from: 'bg-[#111929]', to: 'bg-slate-100' },
  { from: 'bg-[#1a1223]', to: 'bg-red-50/50' },
  { from: 'bg-gray-900/60', to: 'bg-slate-100/60' },
  { from: 'bg-gray-900/50', to: 'bg-slate-100/50' },
  { from: 'bg-gray-900', to: 'bg-slate-100' },
  { from: 'bg-pink-950/20', to: 'bg-red-50' },
  { from: 'bg-cyan-500/10', to: 'bg-blue-50' },
  { from: 'bg-cyan-950/20', to: 'bg-blue-50/30' },
  { from: 'bg-cyan-950', to: 'bg-blue-50' },
  { from: 'bg-pink-950/80', to: 'bg-red-50' },
  { from: 'bg-pink-950', to: 'bg-red-50' },
  { from: 'bg-pink-500/5', to: 'bg-red-50' },
  { from: 'bg-[#0c0f19]', to: 'bg-slate-50' },

  // Borders
  { from: 'border-[rgba(0,240,255,0.15)]', to: 'border-slate-200' },
  { from: 'border-gray-800/80', to: 'border-slate-200' },
  { from: 'border-gray-800/60', to: 'border-slate-200' },
  { from: 'border-gray-800', to: 'border-slate-200' },
  { from: 'border-gray-700/60', to: 'border-slate-200' },
  { from: 'border-gray-700', to: 'border-slate-300' },
  { from: 'border-cyan-500/20', to: 'border-blue-200' },
  { from: 'border-pink-500/20', to: 'border-red-200' },
  { from: 'border-pink-500/25', to: 'border-red-200' },
  { from: 'border-pink-900/20', to: 'border-red-100' },
  { from: 'border-pink-700/50', to: 'border-red-200' },
  { from: 'border-cyan-400/40', to: 'border-blue-300' },

  // Texts (general)
  { from: 'text-white font-bold', to: 'text-slate-800 font-bold' },
  { from: 'text-white mb-2', to: 'text-slate-900 mb-2' },
  { from: 'text-white mt-1', to: 'text-slate-900 mt-1' },
  { from: 'text-white border-b', to: 'text-slate-800 border-b' },
  { from: 'text-white mb-6', to: 'text-slate-900 mb-6' },
  { from: 'text-white mt-2', to: 'text-slate-900 mt-2' },
  { from: 'text-white border-b', to: 'text-slate-800 border-b' },
  { from: 'text-white flex items-center', to: 'text-slate-800 flex items-center' },
  { from: 'text-white bg-black/40', to: 'text-slate-950 bg-white/60' },
  { from: 'text-white', to: 'text-slate-900' }, // fallback
  { from: 'text-gray-400 text-sm', to: 'text-slate-600 text-sm' },
  { from: 'text-gray-400 text-xs', to: 'text-slate-500 text-xs' },
  { from: 'text-gray-400 font-bold', to: 'text-slate-600 font-bold' },
  { from: 'text-gray-400 font-medium', to: 'text-slate-500 font-medium' },
  { from: 'text-gray-400 font-mono', to: 'text-slate-600 font-mono' },
  { from: 'text-gray-400 mb-2', to: 'text-slate-600 mb-2' },
  { from: 'text-gray-400', to: 'text-slate-600' },
  { from: 'text-gray-200', to: 'text-slate-700' },
  { from: 'text-gray-300', to: 'text-slate-600' },
  { from: 'text-gray-500', to: 'text-slate-400' },
  { from: 'text-pink-300', to: 'text-red-700' },
  { from: 'text-pink-400', to: 'text-red-600' },
  { from: 'text-pink-500', to: 'text-red-500' },
  { from: 'text-cyan-400', to: 'text-blue-600' },
  { from: 'text-amber-400', to: 'text-yellow-600' },
  
  // Specific replacements to restore white text on buttons where needed
  { from: 'className="btn-primary w-full mt-2">\n                    인증하기', to: 'className="btn-primary w-full mt-2 text-white">\n                    인증하기' },
  { from: 'className="btn-primary w-full mt-4 flex items-center justify-center gap-2 py-3"', to: 'className="btn-primary w-full mt-4 flex items-center justify-center gap-2 py-3 text-white"' }
];

replacements.forEach(rep => {
  // Replace all occurrences
  content = content.split(rep.from).join(rep.to);
});

fs.writeFileSync(filePath, content, 'utf8');
console.log('App.tsx styles successfully replaced!');
