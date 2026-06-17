import fs from 'fs';
const content = fs.readFileSync('src/App.tsx', 'utf-8');

const backtickCount = (content.match(/`/g) || []).length;
console.log('Backtick count:', backtickCount, '(even:', backtickCount % 2 === 0, ')');

const singleQuoteCount = (content.match(/'/g) || []).length;
console.log('Single quote count:', singleQuoteCount, '(even:', singleQuoteCount % 2 === 0, ')');

const openCommentCount = (content.match(/\/\*/g) || []).length;
const closeCommentCount = (content.match(/\*\//g) || []).length;
console.log('Block comments open:', openCommentCount, 'close:', closeCommentCount, '(balanced:', openCommentCount === closeCommentCount, ')');

const beforeOwner = content.split('\n').slice(0, 1264).join('\n');
const backticksBefore = (beforeOwner.match(/`/g) || []).length;
console.log('Backticks before OwnerDashboard:', backticksBefore, '(even:', backticksBefore % 2 === 0, ')');

const lines = content.split('\n');

// Check parens in fills section
let totalOpen = 0, totalClose = 0;
for (let i = 1381; i < 1431; i++) {
  const line = lines[i];
  const openP = (line.match(/\(/g) || []).length;
  const closeP = (line.match(/\)/g) || []).length;
  totalOpen += openP;
  totalClose += closeP;
  if (openP !== closeP) {
    console.log('Line', i+1, 'unbalanced parens: open=' + openP + ' close=' + closeP);
  }
}
console.log('Fills section total parens: open=' + totalOpen + ' close=' + totalClose);

// Check brace depth in OwnerDashboard
let braceDepth = 0;
for (let i = 1264; i < 1660; i++) {
  const line = lines[i];
  for (const ch of line) {
    if (ch === '{') braceDepth++;
    if (ch === '}') braceDepth--;
  }
}
console.log('OwnerDashboard final brace depth:', braceDepth, '(should be 0)');

// Check if there might be an unclosed JSX tag in the whole file
// Look for template literals that might have issues
const templateLines = content.split('\n');
for (let i = 0; i < templateLines.length; i++) {
  const line = templateLines[i];
  // Check for ${ that might not be properly closed
  const dollarBraceOpens = (line.match(/\${/g) || []).length;
  if (dollarBraceOpens > 0) {
    // Count } in this line (rough)
    console.log('Line ' + (i+1) + ' has ${' + dollarBraceOpens + ' time(s)');
  }
}
