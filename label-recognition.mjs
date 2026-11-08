const IGNORED_WORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'com', 'em', 'para', 'tipo', 'un', 'und',
  'unidade', 'produto', 'preco', 'oferta', 'promocao', 'por', 'cada', 'kg',
  'grama', 'gramas', 'ml', 'litro', 'litros', 'r', 'rs'
]);

const BRANDS = [
  ['tio joao', 'Tio João'], ['nestle', 'Nestlé'], ['nescafe', 'Nescafé'],
  ['paganini', 'Paganini'], ['tio urias', 'Tio Úrias'], ['dona benta', 'Dona Benta'],
  ['qualita', 'Qualitá'], ['carrefour', 'Carrefour'], ['knorr', 'Knorr'],
  ['maggi', 'Maggi'], ['yoki', 'Yoki'], ['camil', 'Camil'], ['sadia', 'Sadia'],
  ['perdigao', 'Perdigão'], ['aurora', 'Aurora'], ['itambe', 'Itambé'],
  ['parmalat', 'Parmalat'], ['danone', 'Danone'], ['yakult', 'Yakult'],
  ['vigor', 'Vigor'], ['piracanjuba', 'Piracanjuba'], ['tang', 'Tang'],
  ['heinz', 'Heinz'], ['predilecta', 'Predilecta'], ['elefante', 'Elefante'],
  ['hellmanns', 'Hellmann’s'], ['unilever', 'Unilever'], ['omo', 'Omo'],
  ['ypê', 'Ypê'], ['ype', 'Ypê'], ['colgate', 'Colgate'], ['oral b', 'Oral-B'],
  ['pampers', 'Pampers'], ['johnson', 'Johnson’s'], ['coca cola', 'Coca-Cola'],
  ['pepsi', 'Pepsi'], ['ambev', 'Ambev']
];

const PRODUCT_HINTS = /\b(arroz|feij[aã]o|sopa|letrinhas|macarr[aã]o|iogurte|leite|queijo|ovo|suco|caf[eé]|farinha|molho|detergente|sabonete|biscoito|bolacha|p[aã]o|a[çc][uú]car|[óo]leo|azeite|manteiga|requeij[aã]o|shampoo|desodorante)\b/i;
const PROMOTION_WORDS = /\b(?:oferta|promo[cç][aã]o|economize|desconto|imperd[ií]vel|s[oó]\s+hoje|pre[cç]o\s+v[aá]lido|leve\s+\d+|pague\s+\d+|a\s+partir\s+de)\b/gi;
const PACK_PATTERN = /\b(\d+(?:[,.]\d+)?)\s*(kg|g|mg|ml|litros?|l|unidades?|un\.?|und\.?|pacotes?|pct\.?|pcte\.?)\b/i;
const PRICE_PATTERN = /(?:\bR\s*\$\s*)?(\d{1,4})\s*([,.])\s*(\d{2})(?!\d)/gi;

export function normalizeLabel(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function wordSet(value) {
  return new Set(normalizeLabel(value).split(/\s+/).filter(word => word.length > 1 && !/^\d+$/.test(word) && !IGNORED_WORDS.has(word)));
}

function findBrand(value) {
  const normalized = ` ${normalizeLabel(value)} `;
  const found = BRANDS.find(([alias]) => normalized.includes(` ${normalizeLabel(alias)} `));
  return found?.[1] ?? '';
}

function variantState(value) {
  const text = normalizeLabel(value);
  return {
    lactose: /\b(?:sem|zero|0) lactose\b|\blactose zero\b/.test(text) ? 'free'
      : /\bcom lactose\b/.test(text) ? 'regular' : '',
    milkFat: /\bdesnatad[oa]s?\b/.test(text) ? 'skim'
      : /\bsemidesnatad[oa]s?\b/.test(text) ? 'semi'
        : /\bintegral\b/.test(text) ? 'whole' : '',
    sugar: /\b(?:sem|zero|0) acucar\b/.test(text) ? 'sugar-free'
      : /\bcom acucar\b/.test(text) ? 'sugar' : ''
  };
}

function hasVariantConflict(a, b) {
  const left = variantState(a);
  const right = variantState(b);
  if (left.lactose !== right.lactose && (left.lactose || right.lactose)) return true;
  return Object.keys(left).some(axis => axis !== 'lactose' && left[axis] && right[axis] && left[axis] !== right[axis]);
}

function packageValue(value) {
  const match = String(value ?? '').match(PACK_PATTERN);
  if (!match) return '';
  const amount = match[1].replace(',', '.');
  const unit = match[2].toLowerCase().replace(/\.$/, '');
  const normalizedUnit = unit.startsWith('kg') ? 'kg'
    : unit === 'mg' ? 'mg'
      : unit === 'g' ? 'g'
        : unit === 'ml' ? 'ml'
          : unit === 'l' || unit.startsWith('litro') ? 'L'
            : unit.startsWith('pct') || unit.startsWith('pcte') || unit.startsWith('pacote') ? 'pacote'
              : 'un.';
  return `${amount} ${normalizedUnit}`;
}

function commercialUnit(text) {
  const match = String(text ?? '').match(/(?:pre[cç]o\s*\/\s*|por\s+|\/\s*)(kg|ml|litros?|l|un(?:idade)?\.?|und\.?|pacote|pct\.?|dz|d[uú]zia)\b/i);
  if (!match) return '';
  const unit = normalizeLabel(match[1]);
  if (unit === 'kg') return 'kg';
  if (unit === 'ml') return 'ml';
  if (unit === 'l' || unit.startsWith('litro')) return 'L';
  if (unit === 'dz' || unit === 'duzia') return 'dúzia';
  if (unit.startsWith('pacote') || unit.startsWith('pct')) return 'pacote';
  return 'un.';
}

function cleanProductLine(line) {
  return String(line ?? '')
    .replace(PRICE_PATTERN, ' ')
    .replace(/\b\d{8,14}\b/g, ' ')
    .replace(PACK_PATTERN, ' ')
    .replace(/\b(?:ean|sku|c[oó]digo|c[oó]d|ref(?:er[eê]ncia)?)\s*[:#-]?\s*[a-z0-9-]+\b/gi, ' ')
    .replace(PROMOTION_WORDS, ' ')
    .replace(/\b(?:atacado|varejo|clube|cpf|validade|vencimento|total|pre[cç]o|unit[aá]rio)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s&'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMetadataLine(line) {
  return /^(?:r\s*\$|pre[cç]o|total|validade|vencimento|c[oó]digo|c[oó]d\b|ean\b|sku\b|atacado\b|varejo\b|leve\s+\d|pague\s+\d|economize\b|desconto\b|por\s+r\$)/i.test(line.trim());
}

function nameFromLines(lines) {
  const candidates = lines.map((raw, index) => {
    const clean = cleanProductLine(raw);
    const tokens = clean.split(/\s+/).filter(token => /\p{L}{2,}/u.test(token));
    const score = tokens.length
      + (PRODUCT_HINTS.test(clean) ? 2.5 : 0)
      + (findBrand(clean) ? 1.5 : 0)
      - (clean.length > 72 ? 3 : 0)
      - (isMetadataLine(raw) ? 5 : 0);
    return { raw, clean, tokens, score, index };
  }).filter(candidate => candidate.tokens.length > 0 && candidate.clean.length <= 90 && !isMetadataLine(candidate.raw))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const best = candidates[0];
  if (!best) return { name: '', brand: '', index: -1 };
  let name = best.clean;
  let brand = findBrand(`${best.raw} ${best.clean}`);
  if (!brand) {
    const nearby = lines.find((line, index) => Math.abs(index - best.index) <= 1 && findBrand(line));
    brand = nearby ? findBrand(nearby) : '';
    if (brand && !normalizeLabel(name).includes(normalizeLabel(brand))) name = `${brand} ${name}`;
  }
  return { name: name.replace(/\s+/g, ' ').trim(), brand, index: best.index };
}

function contextForLine(line) {
  if (/\batacado\b/i.test(line)) return 'Atacado';
  if (/\bvarejo\b/i.test(line)) return 'Varejo';
  if (/\b(?:leve\s+\d+|pague\s+\d+|quantidade\s+m[ií]nima|a\s+partir\s+de)\b/i.test(line)) return 'Condicionado';
  if (/\b(?:pre[cç]o|por\s+kg|por\s+litro|\/\s*(?:kg|l|un))\b/i.test(line)) return 'Preço por unidade';
  return 'OCR';
}

function priceCandidate(value, line, score, evidence, source, index) {
  return {
    value: Number(value.toFixed(2)),
    line: String(line ?? '').trim(),
    context: contextForLine(line ?? ''),
    score,
    evidence,
    source,
    index
  };
}

function textPriceCandidates(lines) {
  const candidates = [];
  for (const [index, line] of lines.entries()) {
    if (/\b(?:ean|sku|c[oó]digo|c[oó]d|validade|vencimento|desconto)\b/i.test(line)) continue;
    for (const match of line.matchAll(PRICE_PATTERN)) {
      const value = Number(`${match[1]}.${match[3]}`);
      if (!Number.isFinite(value) || value <= 0 || value >= 10000) continue;
      const suffix = line.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 3);
      if (/^\s*%/.test(suffix)) continue;
      const explicitCurrency = /R\s*\$/i.test(match[0]);
      const contextual = /\b(?:pre[cç]o|por|oferta|atacado|varejo|unit[aá]rio)\b/i.test(line);
      candidates.push(priceCandidate(value, line, explicitCurrency ? 6 : contextual ? 4 : 2,
        explicitCurrency ? 'Símbolo R$ junto ao valor' : contextual ? 'Texto de preço na mesma linha' : 'Valor decimal no OCR',
        'text', index));
    }
  }
  return candidates;
}

function geometryPriceCandidates(text, words) {
  if (!Array.isArray(words) || words.length < 2) return [];
  const normalizedWords = words.map((word, index) => {
    const bbox = word?.bbox;
    if (!bbox || ![bbox.x0, bbox.y0, bbox.x1, bbox.y1].every(Number.isFinite)) return null;
    const token = String(word.text ?? '').trim();
    const number = token.match(/^(\d{1,4})[,\.]?$/)?.[1];
    const cents = token.match(/^(\d{2})$/)?.[1];
    return {
      index, token, number, cents, value: Number(number ?? cents),
      x0: bbox.x0, y0: bbox.y0, x1: bbox.x1, y1: bbox.y1,
      width: bbox.x1 - bbox.x0, height: bbox.y1 - bbox.y0,
      centerY: (bbox.y0 + bbox.y1) / 2,
      confidence: Number(word.confidence ?? 100)
    };
  }).filter(Boolean);
  const candidates = [];
  for (const main of normalizedWords.filter(word => word.number !== undefined && word.value < 10000)) {
    for (const cents of normalizedWords.filter(word => word.cents !== undefined && word.index !== main.index)) {
      if (cents.x0 < main.x1 - main.height * 0.15) continue;
      const gap = cents.x0 - main.x1;
      if (gap > Math.max(24, main.height * 1.1)) continue;
      if (Math.abs(cents.centerY - main.centerY) > main.height * 0.75) continue;
      const ratio = cents.height / Math.max(main.height, 1);
      const raised = cents.centerY < main.centerY - main.height * 0.12;
      if (ratio > 0.88 && !raised) continue;
      if (ratio < 0.2) continue;
      const intervening = normalizedWords.some(word => word.index !== main.index && word.index !== cents.index
        && word.x0 >= main.x1 && word.x1 <= cents.x0
        && Math.abs(word.centerY - main.centerY) <= main.height * 0.6
        && !/^[,\.]$/.test(word.token));
      if (intervening) continue;
      if (main.confidence < 20 || cents.confidence < 20) continue;
      const value = Number(`${main.value}.${cents.value}`);
      if (!Number.isFinite(value) || value <= 0 || value >= 10000) continue;
      const currencyNear = normalizedWords.some(word => /^(?:r\$|r|\$)$/i.test(word.token)
        && Math.abs(word.centerY - main.centerY) <= main.height * 0.7
        && word.x1 <= main.x0 && main.x0 - word.x1 <= main.height * 3);
      const context = `${text} ${words.map(word => word.text ?? '').join(' ')}`;
      const score = 4 + (raised ? 1 : 0) + (currencyNear ? 2 : 0);
      candidates.push(priceCandidate(value, context, score,
        'Reais e centavos reconhecidos em blocos adjacentes, com centavos menores/elevados',
        'geometry', Math.min(main.index, cents.index)));
    }
  }
  return candidates;
}

export function extractPriceCandidates(text, words = []) {
  const lines = String(text ?? '').replace(/\u00a0/g, ' ').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const candidates = [...textPriceCandidates(lines), ...geometryPriceCandidates(text, words)];
  const unique = new Map();
  for (const candidate of candidates) {
    const key = candidate.value.toFixed(2);
    const current = unique.get(key);
    if (!current || candidate.score > current.score) unique.set(key, candidate);
  }
  return [...unique.values()].sort((a, b) => b.score - a.score || a.index - b.index);
}

export function parseLabel(text, words = []) {
  const lines = String(text ?? '').replace(/\u00a0/g, ' ').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const parsedName = nameFromLines(lines);
  const nearbyLines = parsedName.index < 0 ? lines : lines.filter((_, index) => Math.abs(index - parsedName.index) <= 2);
  const pack = nearbyLines.map(packageValue).find(Boolean) || lines.map(packageValue).find(Boolean) || 'un.';
  const unit = commercialUnit(lines.join(' '));
  const priceCandidates = extractPriceCandidates(text, words);
  return {
    name: parsedName.name,
    brand: parsedName.brand,
    pack,
    unit,
    price: priceCandidates.length === 1 ? priceCandidates[0].value : null,
    ambiguous: priceCandidates.length > 1,
    priceCandidates,
    lines
  };
}

function packageAmount(value) {
  const match = String(value ?? '').match(PACK_PATTERN);
  if (!match) return null;
  let amount = Number(match[1].replace(',', '.'));
  const rawUnit = match[2].toLowerCase().replace(/\.$/, '');
  if (rawUnit === 'g') { amount /= 1000; return { amount, unit: 'mass' }; }
  if (rawUnit === 'mg') { amount /= 1000000; return { amount, unit: 'mass' }; }
  if (rawUnit === 'kg') return { amount, unit: 'mass' };
  if (rawUnit === 'ml') { amount /= 1000; return { amount, unit: 'volume' }; }
  if (rawUnit === 'l' || rawUnit.startsWith('litro')) return { amount, unit: 'volume' };
  if (/^(?:un|und|unidade)/.test(rawUnit)) return { amount, unit: 'count' };
  return { amount, unit: 'package' };
}

export function findSimilarProducts(name, items, limit = 3) {
  const incoming = wordSet(name);
  if (!incoming.size) return [];
  const incomingBrand = findBrand(name);
  const incomingPack = packageAmount(name);
  const matches = [];
  for (const item of items ?? []) {
    const candidateName = String(item?.name ?? '');
    if (hasVariantConflict(name, candidateName)) continue;
    const existing = wordSet(candidateName);
    if (!existing.size) continue;
    const shared = [...incoming].filter(word => existing.has(word)).length;
    if (!shared) continue;
    let score = shared / Math.max(incoming.size, existing.size);
    const existingBrand = findBrand(candidateName);
    if (incomingBrand && existingBrand) {
      if (normalizeLabel(incomingBrand) === normalizeLabel(existingBrand)) score += 0.12;
      else score -= 0.3;
    }
    const existingPack = packageAmount(candidateName) || packageAmount(item?.pack);
    if (incomingPack && existingPack && incomingPack.unit === existingPack.unit && incomingPack.amount !== existingPack.amount) {
      const ratio = Math.max(incomingPack.amount, existingPack.amount) / Math.min(incomingPack.amount, existingPack.amount);
      score -= ratio >= 1.5 ? 0.24 : 0.08;
    }
    score = Math.max(0, Math.min(1, score));
    if (score >= 0.28) matches.push({ item, score });
  }
  return matches.sort((a, b) => b.score - a.score || String(a.item.name).localeCompare(String(b.item.name), 'pt-BR')).slice(0, limit);
}

export function combineProductName(name, brand) {
  const cleanName = String(name ?? '').trim().replace(/\s+/g, ' ');
  const cleanBrand = String(brand ?? '').trim().replace(/\s+/g, ' ');
  if (!cleanBrand || normalizeLabel(cleanName).includes(normalizeLabel(cleanBrand))) return cleanName;
  return `${cleanBrand} ${cleanName}`.trim();
}

export function formatPackAndUnit(pack, unit) {
  const cleanPack = String(pack ?? '').trim();
  const cleanUnit = String(unit ?? '').trim();
  if (!cleanUnit || !cleanPack || normalizeLabel(cleanPack).includes(normalizeLabel(cleanUnit))) return cleanPack || cleanUnit || 'un.';
  return `${cleanPack} · venda por ${cleanUnit}`;
}
