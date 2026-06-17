const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf-8');

// Count backticks
const backtickCount = (content.match(/`/g) || []).length;
console.log('Backtick count:', backtickCount, '(should be even:', backtickCount % 2 === 0, ')');

// Count single quotes (rough - but inside JSX this is hard)
const singleQuoteCount = (content.match(/'/g) || []).length;
console.log('Single quote count:', singleQuoteCount, '(should be even:', singleQuoteCount % 2 === 0, ')');

// Check for /* */ balance
const openCommentCount = (content.match(/\/\*/g) || []).length;
const closeCommentCount = (content.match(/\*\//g) || []).length;
console.log('Block comments open:', openCommentCount, 'close:', closeCommentCount, '(balanced:', openCommentCount === closeCommentCount, ')');

// Now check around the OwnerDashboard - check if backticks are balanced before line 1265
const beforeOwner = content.split('\n').slice(0, 1264).join('\n');
const backticksBefore = (beforeOwner.match(/`/g) || []).length;
console.log('Backticks before OwnerDashboard:', backticksBefore, '(even:', backticksBefore % 2 === 0, ')');

// Check for regex literals that might confuse parser
// A regex literal starts with / and is not preceded by a binary operator
// This is hard to check reliably, so skip for now

// Check for any odd-looking patterns around line 1382
const lines = content.split('\n');
for (let i = 1279; i < 1382; i++) {
  const line = lines[i];
  // Check for bare parentheses that might be unbalanced  
  const openParens = (line.match(/\(/g) || []).length;
  const closeParens = (line.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    console.log('Line ' + (i+1) + ' has unbalanced parens: open=' + openParens + ' close=' + closeParens);
  }
}
for (let i = 1382; i <= 1430; i++) {
  const line = lines[i];
  const openParens = (line.match(/\(/g) || []).length;
  const closeParens = (line.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    console.log('Line ' + (i+1) + ' has unbalanced parens: open=' + openParens + ' close=' + closeParens);
  }
}
