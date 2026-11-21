(function (root) {
  'use strict';

  const ids = Object.freeze(['baskets', 'mystery', 'compare', 'numberline', 'provisions', 'stories']);
  const catalog = {
    CP: [
      {id: 'to10', label: 'De 1 à 10', scale: 1, max: 10},
      {id: 'to20', label: 'De 1 à 20', scale: 1, max: 20}
    ],
    CE1: [{id: 'to100', label: 'Jusqu’à 100', scale: 1, max: 100}],
    CE2: [{id: 'to1000', label: 'Jusqu’à 1 000', scale: 1, max: 1000}],
    CM1: [
      {id: 'to10000', label: 'Jusqu’à 10 000', scale: 1, max: 10000},
      {id: 'tenths', label: 'Les dixièmes', scale: 10, max: 200}
    ],
    CM2: [
      {id: 'to100000', label: 'Jusqu’à 100 000', scale: 1, max: 100000},
      {id: 'hundredths', label: 'Les centièmes', scale: 100, max: 10000},
      {id: 'thousandths', label: 'Les millièmes', scale: 1000, max: 100000}
    ]
  };

  function stages(level) {
    const grade = typeof level === 'string' ? level.toUpperCase() : '';
    if (!Object.hasOwn(catalog, grade)) throw new RangeError('Choisis un niveau de CP à CM2.');
    return catalog[grade].map(stage => ({...stage}));
  }

  function precision(scale) {
    if (!Number.isSafeInteger(scale) || scale < 1) return null;
    const result = Math.log10(scale);
    return Number.isInteger(result) ? result : null;
  }

  function format(value, scale = 1) {
    const digits = precision(scale);
    if (digits === null || !Number.isSafeInteger(value)) throw new RangeError('Nombre ou échelle invalide.');
    const sign = value < 0 ? '−' : '';
    const raw = String(Math.abs(value));
    if (!digits) return sign + raw;
    const padded = raw.padStart(digits + 1, '0');
    const fraction = padded.slice(-digits).replace(/0+$/, '');
    return sign + padded.slice(0, -digits) + (fraction ? ',' + fraction : '');
  }

  function parse(text, scale = 1) {
    const digits = precision(scale);
    if (digits === null || typeof text !== 'string') return null;
    const match = /^([−-]?)(\d+)(?:[.,](\d+))?$/.exec(text.trim());
    if (!match) return null;
    let fraction = match[3] || '';
    if (fraction.length > digits) {
      if (!/^0*$/.test(fraction.slice(digits))) return null;
      fraction = fraction.slice(0, digits);
    }
    const scaled = BigInt(match[2] + fraction.padEnd(digits, '0')) * (match[1] ? -1n : 1n);
    if (scaled > BigInt(Number.MAX_SAFE_INTEGER) || scaled < BigInt(Number.MIN_SAFE_INTEGER)) return null;
    return Number(scaled);
  }

  function check(task, value) {
    return !!task && Number.isSafeInteger(task.answer) && parse(value, task.scale) === task.answer;
  }

  function integer(random, min, max) {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new RangeError('Le tirage doit être compris entre 0 et 1 exclu.');
    return min + Math.floor(sample * (max - min + 1));
  }

  function pick(random, values) { return values[integer(random, 0, values.length - 1)]; }

  function shuffle(random, values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = integer(random, 0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // Sampling decimal answers with a nonzero last place makes each decimal stage distinct.
  function quantity(config, random, min = 1, max = config.max) {
    if (config.scale === 1 || min === max) return integer(random, min, max);
    const value = integer(random, min, max);
    if (value % 10 !== 0) return value;
    return value + 1 <= max ? value + 1 : value - 1 >= min ? value - 1 : value;
  }

  function alternatives(answer, config, random, min = 1, max = config.max) {
    const values = new Set([answer]);
    for (let attempt = 0; values.size < 4 && attempt < 40; attempt++) {
      values.add(integer(random, min, max));
    }
    // A constant supplied RNG must still produce four different choices.
    for (let offset = 1; values.size < Math.min(4, max - min + 1); offset++) {
      if (answer - offset >= min) values.add(answer - offset);
      if (values.size < 4 && answer + offset <= max) values.add(answer + offset);
    }
    return shuffle(random, [...values]);
  }

  function decomposition(total, scale, objects) {
    if (objects && total <= 20) return [{value: 1, count: total, label: 'fruits'}];
    const groups = [];
    const names = {
      100000: 'centaines de milliers', 10000: 'dizaines de milliers', 1000: 'milliers',
      100: 'centaines', 10: 'dizaines', 1: 'unités'
    };
    let place = 10 ** Math.floor(Math.log10(total));
    while (place >= 1) {
      const count = Math.floor(total / place) % 10;
      if (count) {
        const realPlace = place / scale;
        const label = names[realPlace] || (realPlace === .1 ? 'dixièmes' : realPlace === .01 ? 'centièmes' : 'millièmes');
        groups.push({value: place, count, label});
      }
      place /= 10;
    }
    return groups;
  }

  function lineTask(task, config, random) {
    const grade = task.level.toUpperCase();
    let start, end, step, ticks;
    if (grade === 'CP') {
      start = 1;
      end = config.max;
      step = 1;
      ticks = end;
    } else {
      const allowedSteps = config.scale > 1
        ? (config.scale === 10 ? [1, 2, 5] : config.scale === 100 ? [1, 2, 5, 10] : [1, 2, 5, 10, 25, 50, 100])
        : grade === 'CE1' ? [1, 2, 5, 10]
          : grade === 'CE2' ? [1, 2, 5, 10, 20, 50, 100]
            : grade === 'CM1' ? [1, 5, 10, 20, 50, 100, 200, 500, 1000]
              : [1, 10, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
      ticks = pick(random, [11, 21]);
      step = pick(random, allowedSteps.filter(value => value * (ticks - 1) <= config.max));
      const latestStart = Math.floor((config.max - step * (ticks - 1)) / step);
      start = integer(random, 0, latestStart) * step;
      end = start + step * (ticks - 1);
    }
    const targetIndex = integer(random, 0, ticks - 1);
    const target = start + targetIndex * step;
    const labelledIndices = grade === 'CP' && config.max === 10
      ? Array.from({length: ticks}, (_, index) => index)
      : [0, Math.floor((ticks - 1) / 2), ticks - 1];
    const labels = labelledIndices.filter(index => index !== targetIndex)
      .map(index => ({index, value: start + index * step}));
    const f = value => format(value, config.scale);
    Object.assign(task, {
      answer: target, a: target, b: start, total: end, unit: 'nombre',
      prompt: 'Place ' + f(target) + ' sur la ligne graduée.',
      spoken: 'Place le nombre ' + f(target) + ' sur la ligne graduée.',
      hint: 'Deux graduations voisines sont séparées de ' + f(step) + '. Compte les intervalles depuis un repère.',
      explanation: 'Chaque intervalle vaut ' + f(step) + '. Le nombre ' + f(target) + ' se trouve à la graduation ' + (targetIndex + 1) + '.',
      choices: [], line: {start, end, step, target, labels, ticks}
    });
  }

  function storyTask(task, config, random) {
    const grade = task.level.toUpperCase();
    const types = grade === 'CP' ? ['add', 'remove', 'missing'] : ['add', 'remove', 'missing', 'compare', 'share'];
    const type = pick(random, types);
    const decimal = config.scale > 1;
    const unit = decimal ? (type === 'share' ? 'litres' : 'mètres') : 'billes';
    const f = value => format(value, config.scale);
    const marbles = value => f(value) + (value === 1 ? ' bille' : ' billes');
    let a, b, total, answer, prompt, hint, explanation, people;
    if (type === 'add') {
      total = quantity(config, random, 2);
      a = integer(random, 1, total - 1);
      b = total - a;
      answer = total;
      prompt = decimal ? 'Le renard a un ruban de ' + f(a) + ' m et un autre de ' + f(b) + ' m. Quelle longueur a-t-il en tout ?'
        : 'Le renard a ' + marbles(a) + '. Le chat lui donne ' + marbles(b) + '. Combien de billes a-t-il maintenant ?';
      hint = 'Réunis les deux quantités. Tu peux les additionner.';
      explanation = f(a) + ' + ' + f(b) + ' = ' + f(answer) + '.';
    } else if (type === 'remove') {
      a = quantity(config, random, 2);
      b = integer(random, 1, a - 1);
      answer = a - b;
      total = a;
      prompt = decimal ? 'La tortue a un ruban de ' + f(a) + ' m. Elle coupe ' + f(b) + ' m. Quelle longueur reste-t-il ?'
        : 'La tortue a ' + marbles(a) + '. Elle en donne ' + f(b) + ' au chat. Combien lui reste-t-il de billes ?';
      hint = 'Retire la quantité donnée de la quantité de départ.';
      explanation = f(a) + ' − ' + f(b) + ' = ' + f(answer) + '.';
    } else if (type === 'missing') {
      b = quantity(config, random, 2);
      a = integer(random, 1, b - 1);
      answer = b - a;
      total = b;
      prompt = decimal ? 'Le chat veut un ruban de ' + f(b) + ' m. Il a déjà ' + f(a) + ' m. Quelle longueur lui manque-t-il ?'
        : 'Le chat veut ' + marbles(b) + ' pour son jeu. Il en a déjà ' + f(a) + '. Combien lui en manque-t-il ?';
      hint = 'Pars de la quantité déjà présente et complète jusqu’à la quantité souhaitée.';
      explanation = f(a) + ' + ' + f(answer) + ' = ' + f(b) + '.';
    } else if (type === 'compare') {
      a = quantity(config, random, 2);
      b = integer(random, 1, a - 1);
      answer = a - b;
      total = a;
      prompt = decimal ? 'Le renard a ' + f(a) + ' m de ruban et la tortue ' + f(b) + ' m. Combien de mètres le renard a-t-il en plus ?'
        : 'Le renard a ' + marbles(a) + ' et la tortue ' + marbles(b) + '. Combien de billes le renard a-t-il en plus ?';
      hint = 'Cherche l’écart entre les deux quantités.';
      explanation = f(a) + ' − ' + f(b) + ' = ' + f(answer) + '.';
    } else {
      people = grade === 'CE1' ? pick(random, [2, 5, 10]) : integer(random, 2, 9);
      answer = quantity(config, random, 1, Math.floor(config.max / people));
      a = answer * people;
      b = people;
      total = a;
      prompt = decimal ? 'Les compagnons partagent ' + f(a) + ' litres d’eau en ' + people + ' bouteilles identiques. Combien de litres faut-il verser dans chaque bouteille ?'
        : 'Les compagnons partagent ' + marbles(a) + ' entre ' + people + ' enfants. Chacun reçoit autant de billes. Combien chaque enfant reçoit-il de billes ?';
      hint = 'Fais ' + people + ' parts égales. Cherche la quantité d’une seule part.';
      explanation = f(a) + ' ÷ ' + people + ' = ' + f(answer) + '.';
    }
    Object.assign(task, {a, b, total, answer, prompt, spoken: prompt, hint, explanation, unit,
      choices: alternatives(answer, config, random), story: {type, a, b, total, people: people || null, unit}});
  }

  function generate(id, level, stageId, random = Math.random) {
    if (!ids.includes(id)) throw new RangeError('Atelier inconnu.');
    const available = stages(level);
    const grade = level.toUpperCase();
    const config = available.find(stage => stage.id === (stageId || available[0].id));
    if (!config) throw new RangeError('Cette difficulté ne correspond pas au niveau choisi.');
    if (typeof random !== 'function') throw new TypeError('Le tirage doit être une fonction.');
    const task = {id, level, stage: config.id, kind: id, scale: config.scale, a: 0, b: 0, total: 0, unit: 'nombre'};
    const f = value => format(value, config.scale);

    if (id === 'numberline') { lineTask(task, config, random); return task; }
    if (id === 'stories') { storyTask(task, config, random); return task; }

    const answer = quantity(config, random);
    if (id === 'baskets') {
      const decimal = config.scale > 1;
      Object.assign(task, {
        answer, a: answer, total: answer, unit: decimal ? 'kg' : 'fruits',
        prompt: decimal ? 'Additionne les masses des lots. Combien de kilogrammes pèsent-ils en tout ?' : 'Combien de fruits y a-t-il en tout ?',
        spoken: decimal ? 'Additionne les masses des lots. Combien de kilogrammes pèsent-ils en tout ?' : 'Compte les fruits, puis choisis leur nombre.',
        groups: decomposition(answer, config.scale, !decimal && grade === 'CP'),
        hint: grade === 'CP' ? 'Touche chaque fruit une seule fois pour le marquer comme compté.' : 'Compte les lots de même valeur, puis additionne leurs quantités.',
        explanation: 'Les lots représentent au total ' + f(answer) + (decimal ? ' kg.' : answer === 1 ? ' fruit.' : ' fruits.'),
        choices: alternatives(answer, config, random)
      });
    } else if (id === 'mystery') {
      Object.assign(task, {
        answer, a: answer, total: answer,
        prompt: 'Écoute le nombre, puis retrouve sa carte.',
        spoken: 'Retrouve le nombre ' + f(answer) + '.',
        hint: config.scale > 1 ? 'Écoute aussi la partie après la virgule. Tu peux réécouter autant que tu veux.' : 'Écoute le nombre jusqu’au bout. Tu peux le réécouter autant que tu veux.',
        explanation: 'Le nombre entendu est ' + f(answer) + '.',
        choices: alternatives(answer, config, random)
      });
    } else if (id === 'compare') {
      let b = quantity(config, random);
      if (b === answer) b = answer < config.max ? answer + 1 : answer - 1;
      const greatest = integer(random, 0, 1) === 1;
      const result = greatest ? Math.max(answer, b) : Math.min(answer, b);
      Object.assign(task, {
        answer: result, a: answer, b, total: Math.max(answer, b), comparison: greatest ? 'greatest' : 'smallest',
        prompt: 'Choisis le ' + (greatest ? 'plus grand' : 'plus petit') + ' nombre.',
        spoken: 'Quel est le ' + (greatest ? 'plus grand' : 'plus petit') + ' nombre : ' + f(answer) + ' ou ' + f(b) + ' ?',
        hint: grade === 'CP' ? 'Tu peux compter les pas sur une ligne de nombres. Le nombre le plus loin est le plus grand.'
          : config.scale > 1 ? 'Compare d’abord les parties entières. Si elles sont égales, compare les dixièmes, puis les chiffres suivants.'
            : 'Compare d’abord le nombre de chiffres. À longueur égale, compare les chiffres de gauche à droite.',
        explanation: f(Math.max(answer, b)) + ' est plus grand que ' + f(Math.min(answer, b)) + '.',
        choices: shuffle(random, [answer, b])
      });
    } else {
      const goal = quantity(config, random, 2);
      const existing = integer(random, 1, goal - 1);
      const missing = goal - existing;
      const decimal = config.scale > 1;
      Object.assign(task, {
        answer: missing, a: existing, b: goal, total: goal, unit: decimal ? 'm' : 'jetons',
        prompt: decimal ? 'Le ruban mesure ' + f(existing) + ' m. Ajoute la longueur manquante pour atteindre ' + f(goal) + ' m.'
          : 'Il y a déjà ' + f(existing) + (existing === 1 ? ' jeton.' : ' jetons.') + ' Combien faut-il en ajouter pour en avoir ' + f(goal) + ' ?',
        spoken: decimal ? 'Le ruban mesure ' + f(existing) + ' mètres. Combien de mètres manque-t-il pour atteindre ' + f(goal) + ' mètres ?'
          : 'Il y a déjà ' + f(existing) + (existing === 1 ? ' jeton.' : ' jetons.') + ' Combien faut-il en ajouter pour en avoir ' + f(goal) + ' ?',
        hint: 'Pars de ' + f(existing) + ' et complète jusqu’à ' + f(goal) + '.',
        explanation: f(existing) + ' + ' + f(missing) + ' = ' + f(goal) + '.',
        choices: alternatives(missing, config, random)
      });
    }
    return task;
  }

  // Saved tasks are external data: validate their shape before the UI renders them.
  function validTask(task) {
    try {
      if (!task || typeof task !== 'object' || !ids.includes(task.id) || task.kind !== task.id) return false;
      const config = stages(task.level).find(stage => stage.id === task.stage);
      if (!config || task.scale !== config.scale) return false;
      const bounded = value => Number.isSafeInteger(value) && value >= 0 && value <= config.max;
      const text = (value, max = 10000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
      if (!['a', 'b', 'total', 'answer'].every(key => bounded(task[key]))) return false;
      if (!['prompt', 'spoken', 'hint', 'explanation'].every(key => text(task[key])) || !text(task.unit, 100)) return false;
      if (!Array.isArray(task.choices) || task.choices.length > 4 || !task.choices.every(bounded)
        || new Set(task.choices).size !== task.choices.length) return false;
      if (task.id === 'numberline') {
        const line = task.line;
        if (!line || typeof line !== 'object' || ![line.start, line.end, line.target].every(bounded)
          || !Number.isSafeInteger(line.step) || line.step <= 0 || line.step > config.max
          || line.start >= line.end || line.target !== task.answer || task.choices.length !== 0) return false;
        const intervals = (line.end - line.start) / line.step;
        if (!Number.isInteger(intervals) || !Number.isInteger(line.ticks) || line.ticks !== intervals + 1
          || (task.level.toUpperCase() === 'CP'
            ? line.start !== 1 || line.end !== config.max || line.step !== 1 || line.ticks !== config.max
            : ![11, 21].includes(line.ticks))) return false;
        if (line.target < line.start || line.target > line.end || !Number.isInteger((line.target - line.start) / line.step)
          || task.a !== task.answer || task.b !== line.start || task.total !== line.end) return false;
        if (!Array.isArray(line.labels) || line.labels.length < 2 || line.labels.length >= line.ticks) return false;
        const indices = new Set();
        for (const label of line.labels) {
          if (!label || !Number.isInteger(label.index) || label.index < 0 || label.index >= line.ticks
            || !bounded(label.value) || label.value !== line.start + label.index * line.step
            || label.value === line.target || indices.has(label.index)) return false;
          indices.add(label.index);
        }
        return true;
      }
      if (task.answer < 1 || task.a < 1 || task.choices.length !== (task.id === 'compare' ? 2 : 4)
        || task.choices.filter(value => value === task.answer).length !== 1) return false;
      if (task.id === 'baskets') {
        if (task.a !== task.answer || task.total !== task.answer || task.b !== 0
          || !Array.isArray(task.groups) || task.groups.length < 1 || task.groups.length > 6) return false;
        let quantity = 0;
        for (const group of task.groups) {
          if (!group || !Number.isSafeInteger(group.value) || group.value < 1 || group.value > config.max
            || !Number.isInteger(Math.log10(group.value)) || !Number.isInteger(group.count)
            || group.count < 1 || group.count > 20 || !text(group.label, 100)) return false;
          quantity += group.value * group.count;
        }
        return quantity === task.answer;
      }
      if (task.id === 'mystery') return task.a === task.answer && task.total === task.answer && task.b === 0
        && task.spoken.includes(format(task.answer, task.scale)) && !/\d/.test(task.prompt);
      if (task.id === 'compare') return ['greatest', 'smallest'].includes(task.comparison) && task.a !== task.b
        && task.total === Math.max(task.a, task.b)
        && task.answer === (task.comparison === 'greatest' ? Math.max(task.a, task.b) : Math.min(task.a, task.b));
      if (task.id === 'provisions') return task.b > task.a && task.total === task.b && task.answer === task.b - task.a;
      const story = task.story;
      if (!story || typeof story !== 'object' || story.a !== task.a || story.b !== task.b || story.total !== task.total
        || story.unit !== task.unit || !(task.level.toUpperCase() === 'CP'
          ? ['add', 'remove', 'missing'] : ['add', 'remove', 'missing', 'compare', 'share']).includes(story.type)) return false;
      if (story.type === 'add') return task.total === task.answer && task.answer === task.a + task.b && story.people === null;
      if (story.type === 'missing') return task.total === task.b && task.b > task.a && task.answer === task.b - task.a && story.people === null;
      if (story.type === 'remove' || story.type === 'compare') return task.total === task.a && task.a > task.b
        && task.answer === task.a - task.b && story.people === null;
      return Number.isInteger(story.people) && story.people >= 2 && story.people <= 10 && task.b === story.people
        && task.total === task.a && task.a === task.answer * story.people;
    } catch {
      return false;
    }
  }

  const api = {ids, stages, generate, format, parse, check, validTask};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LearningGames = api;
})(globalThis);
