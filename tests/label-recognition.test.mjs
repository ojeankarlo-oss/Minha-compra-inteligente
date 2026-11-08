import test from 'node:test';
import assert from 'node:assert/strict';
import {
  combineProductName,
  extractPriceCandidates,
  findSimilarProducts,
  formatPackAndUnit,
  parseLabel
} from '../label-recognition.mjs';

test('extrai produto, marca, embalagem e preço brasileiro explícito', () => {
  const result = parseLabel('SOPA KNORR LETRINHAS\n73 g\nR$ 5,99');
  assert.match(result.name, /sopa.*knorr.*letrinhas/i);
  assert.equal(result.brand, 'Knorr');
  assert.equal(result.pack, '73 g');
  assert.equal(result.price, 5.99);
  assert.equal(result.ambiguous, false);
});

test('não escolhe automaticamente quando a etiqueta contém varejo e atacado', () => {
  const result = parseLabel('SOPA KNORR LETRINHAS\nR$ 5,99 Varejo\nR$ 4,99 Atacado\n73 g');
  assert.equal(result.price, null);
  assert.equal(result.ambiguous, true);
  assert.deepEqual(new Set(result.priceCandidates.map(candidate => candidate.value)), new Set([5.99, 4.99]));
  assert.deepEqual(new Set(result.priceCandidates.map(candidate => candidate.context)), new Set(['Varejo', 'Atacado']));
});

test('recompõe reais e centavos OCR separados quando os centavos são menores e elevados', () => {
  const words = [
    { text: '5', confidence: 92, bbox: { x0: 100, y0: 100, x1: 130, y1: 150 } },
    { text: '99', confidence: 89, bbox: { x0: 134, y0: 90, x1: 160, y1: 115 } }
  ];
  const candidates = extractPriceCandidates('SOPA KNORR LETRINHAS\n5 99', words);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].value, 5.99);
  assert.equal(candidates[0].source, 'geometry');
});

test('não inventa preço quando OCR reconhece somente nome e embalagem', () => {
  const result = parseLabel('SOPA KNORR LETRINHAS\n73 g\nCÓDIGO 123456789012');
  assert.equal(result.price, null);
  assert.equal(result.priceCandidates.length, 0);
});

test('sugere produto genérico para nome mais específico e embalagem equivalente', () => {
  const matches = findSimilarProducts('Arroz Branco 5 kg', [
    { id: 'arroz', name: 'Arroz', pack: '5 kg' },
    { id: 'feijao', name: 'Feijão', pack: '1 kg' }
  ]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].item.id, 'arroz');
});

test('sugere Sopa para Sopa Knorr Letrinhas sem substituir automaticamente', () => {
  const matches = findSimilarProducts('Sopa Knorr Letrinhas', [
    { id: 'sopa', name: 'Sopa', pack: 'un.' },
    { id: 'macarrao', name: 'Macarrão', pack: '500 g' }
  ]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].item.id, 'sopa');
});

test('impede correspondência de versões com e sem lactose', () => {
  const matches = findSimilarProducts('Iogurte Zero Lactose', [
    { id: 'sem', name: 'Iogurte sem lactose', pack: '170 g' },
    { id: 'com', name: 'Iogurte com lactose', pack: '170 g' }
  ]);
  assert.deepEqual(matches.map(match => match.item.id), ['sem']);
});

test('compõe marca e unidade na string existente sem acrescentar campos ao Firestore', () => {
  assert.equal(combineProductName('Sopa Letrinhas', 'Knorr'), 'Knorr Sopa Letrinhas');
  assert.equal(combineProductName('Sopa Knorr Letrinhas', 'Knorr'), 'Sopa Knorr Letrinhas');
  assert.equal(formatPackAndUnit('73 g', 'kg'), '73 g · venda por kg');
});


test('normaliza preços com dois e três algarismos antes dos centavos', () => {
  for (const [label, expected] of [['R$ 19,90', 19.9], ['129,99', 129.99], ['R$ 129.99', 129.99]]) {
    const candidates = extractPriceCandidates(label);
    assert.equal(candidates.length, 1, label);
    assert.equal(candidates[0].value, expected, label);
  }
});

test('ignora códigos, validade e desconto percentual como se fossem preços', () => {
  const candidates = extractPriceCandidates('EAN 7891234567890\nValidade 05/11/2026\nDesconto 30,00%');
  assert.equal(candidates.length, 0);
});

test('não sugere iogurte genérico para produto com lactose explicitamente diferente ou desconhecida', () => {
  const matches = findSimilarProducts('Iogurte Zero Lactose', [
    { id: 'sem', name: 'Iogurte sem lactose', pack: '170 g' },
    { id: 'com', name: 'Iogurte com lactose', pack: '170 g' },
    { id: 'generico', name: 'Iogurte', pack: '170 g' }
  ]);
  assert.deepEqual(matches.map(match => match.item.id), ['sem']);
});

test('considera equivalência de massa e evita sugestão automática quando a embalagem diverge muito', () => {
  const equivalent = findSimilarProducts('Arroz Branco 500 g', [
    { id: 'meio', name: 'Arroz', pack: '0,5 kg' }
  ]);
  assert.deepEqual(equivalent.map(match => match.item.id), ['meio']);
  const different = findSimilarProducts('Arroz Branco 5 kg', [
    { id: 'um', name: 'Arroz', pack: '1 kg' }
  ]);
  assert.deepEqual(different, []);
});


test('embalagem numérica não dilui a semelhança lexical do nome do produto', () => {
  const matches = findSimilarProducts('Sopa Knorr Letrinhas 73 g', [
    { id: 'sopa', name: 'Sopa', pack: 'un.' }
  ]);
  assert.deepEqual(matches.map(match => match.item.id), ['sopa']);
});
