// Fix the fills tab section to use expression-body map instead of block-body map
const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf-8');
const lines = content.split('\n');

// Find the fills tab section (lines 1382-1430)
// Replace the block-body map with expression-body
// Original:
//   {fills.slice().reverse().map(fill => {
//     const v = vehicles.find(veh => veh.id === fill.vehicleId)
//     const d = drivers.find(drv => drv.id === fill.driverId)
//     return (
//       <div key={fill.id} className="p-4 ...">
//         ... (uses v?.plate, d?.name, etc.)
//       </div>
//     )
//   })}

// New: inline the lookups, use expression body
//   {fills.slice().reverse().map(fill => {
//     const v = vehicles.find(veh => veh.id === fill.vehicleId)
//     const d = drivers.find(drv => drv.id === fill.driverId)
//     return ( ... )
//   })}

// Actually, let's just replace the whole section
const startLine = 1381; // 0-indexed: line 1382
const endLine = 1430;   // 0-indexed: line 1431

// Find the actual section content
const section = lines.slice(startLine, endLine + 1).join('\n');
console.log('Section from line 1382 to 1431:');
console.log(section.substring(0, 200) + '...');
console.log('---');
