import fs from 'fs';
import path from 'path';

const outputDir = process.argv[2];
const resultsPath = path.join(outputDir, 'results.json');
const turnsPath = path.join(outputDir, 'turns.json');

try {
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  const turns = JSON.parse(fs.readFileSync(turnsPath, 'utf-8'));

  const lastAssistantTurn = turns.filter((t: any) => t.role === 'assistant').pop();
  const finalAnswer = lastAssistantTurn?.content || '';

  const output = {
    passed: finalAnswer.length > 50,
    score: finalAnswer.length > 200 ? 1.0 : 0.5,
    details: {
      hasCode: finalAnswer.includes('def ') || finalAnswer.includes('function'),
      answerLength: finalAnswer.length,
      turnCount: results.stats?.turnCount,
    },
  };

  console.log(JSON.stringify(output));
} catch (err) {
  console.log(JSON.stringify({ passed: false, score: 0, error: (err as Error).message }));
}
