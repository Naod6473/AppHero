// Préavis (app 11) : les paris de départ, inscrits en base à la toute première visite.
// Ensuite, tout se passe sur la page de l'arbitre (/arbitre/) : ce fichier n'est plus relu.
//
// Règles d'écriture :
// - des faits publics et vérifiables (un vote, un chiffre officiel, une date), jamais une personne visée ;
// - « rules » dit exactement comment on tranche, et d'où vient la réponse ;
// - pct = l'estimation de départ (total 100) : elle fixe les premières cotes, la salle fait le reste ;
// - grogne = de -100 (tout va bien) à +100 (ça chauffe) : c'est ce qui fait bouger le grognomètre ;
// - les dates portent leur décalage : +01:00 en hiver, +02:00 à partir du 28 mars 2027.

export const SEED_MARKETS = [
  // ------------------------------------------------------------ Assemblée
  {
    id: "budget-2027",
    symbol: "BUDGET",
    cat: "assemblee",
    pinned: true,
    title: "Comment la France entrera-t-elle dans l'année 2027 côté budget ?",
    rules:
      "On regarde le Journal officiel au 1er janvier 2027. « Un budget promulgué » : la loi de finances pour 2027 y est publiée au plus tard le 31 décembre 2026. « Une loi spéciale » : une loi spéciale autorise l'État à percevoir les impôts en attendant. « Des ordonnances » : le budget est mis en vigueur par ordonnances. « Autre chose » : tout le reste.",
    closesAt: "2026-12-16T23:59:00+01:00",
    resolveBy: "2027-01-01T12:00:00+01:00",
    outcomes: [
      { label: "Un budget promulgué", pct: 20, grogne: -60 },
      { label: "Une loi spéciale", pct: 50, grogne: 20 },
      { label: "Des ordonnances", pct: 25, grogne: 70 },
      { label: "Autre chose", pct: 5, grogne: 40 },
    ],
  },
  {
    id: "budget-49-3",
    symbol: "49.3",
    cat: "assemblee",
    title: "Le gouvernement dégainera-t-il le 49.3 sur le budget avant le 31 décembre ?",
    rules:
      "Oui si le Premier ministre engage la responsabilité du gouvernement (article 49, alinéa 3 de la Constitution) sur le budget de l'État ou celui de la Sécurité sociale pour 2027, entre le 28 novembre et le 31 décembre 2026. Source : les comptes rendus de l'Assemblée nationale.",
    closesAt: "2026-12-20T23:59:00+01:00",
    resolveBy: "2026-12-31T23:59:00+01:00",
    outcomes: [
      { label: "Oui", pct: 40, grogne: 80 },
      { label: "Non", pct: 60, grogne: -40 },
    ],
  },
  {
    id: "censure",
    symbol: "CENSURE",
    cat: "assemblee",
    title: "Une motion de censure fera-t-elle tomber le gouvernement avant le 1er mars 2027 ?",
    rules:
      "Oui si l'Assemblée nationale adopte une motion de censure, à la majorité absolue des députés, entre le 28 novembre 2026 et le 28 février 2027. Source : l'analyse du scrutin sur assemblee-nationale.fr.",
    closesAt: "2027-01-31T23:59:00+01:00",
    resolveBy: "2027-03-01T12:00:00+01:00",
    outcomes: [
      { label: "Oui", pct: 20, grogne: 100 },
      { label: "Non", pct: 80, grogne: -30 },
    ],
  },
  {
    id: "matignon",
    symbol: "MATIGNON",
    cat: "assemblee",
    title: "Le Premier ministre du 28 novembre sera-t-il encore à Matignon le 1er mars 2027 ?",
    rules:
      "Oui si la personne qui est Premier ministre le 28 novembre 2026 l'est toujours le 1er mars 2027 à midi. Non si sa démission a été acceptée ou si un successeur a été nommé avant. Source : le Journal officiel et elysee.fr.",
    closesAt: "2027-01-31T23:59:00+01:00",
    resolveBy: "2027-03-01T12:00:00+01:00",
    outcomes: [
      { label: "Oui", pct: 70, grogne: -40 },
      { label: "Non", pct: 30, grogne: 80 },
    ],
  },
  {
    id: "dissolution",
    symbol: "DISSOL",
    cat: "assemblee",
    title: "L'Assemblée nationale sera-t-elle dissoute avant le premier tour de la présidentielle ?",
    rules: "Oui si un décret de dissolution de l'Assemblée nationale paraît au Journal officiel avant le 18 avril 2027. Source : le Journal officiel.",
    closesAt: "2027-03-31T23:59:00+02:00",
    resolveBy: "2027-04-18T08:00:00+02:00",
    outcomes: [
      { label: "Oui", pct: 4, grogne: 100 },
      { label: "Non", pct: 96, grogne: -10 },
    ],
  },

  // ------------------------------------------------------------ Grèves
  {
    id: "sncf-noel",
    symbol: "SNCF.NOEL",
    cat: "greves",
    pinned: true,
    title: "Une grève à la SNCF perturbera-t-elle le premier week-end des vacances de Noël ?",
    rules:
      "Oui si, le samedi 19 ou le dimanche 20 décembre 2026, la SNCF annonce un plan de transport réduit sur les TGV ou les Intercités à cause d'une grève nationale. Un préavis levé avant le départ ne compte pas. Source : les communiqués de la SNCF et les dépêches du jour.",
    closesAt: "2026-12-17T23:59:00+01:00",
    resolveBy: "2026-12-20T20:00:00+01:00",
    outcomes: [
      { label: "Oui", pct: 25, grogne: 100 },
      { label: "Non", pct: 75, grogne: -60 },
    ],
  },
  {
    id: "sncf-hiver",
    symbol: "SNCF.SKI",
    cat: "greves",
    title: "Une grève nationale à la SNCF tombera-t-elle pendant les vacances d'hiver ?",
    rules:
      "Oui si au moins une journée de grève nationale, avec un plan de transport réduit annoncé par la SNCF, a lieu entre le samedi 6 février et le dimanche 7 mars 2027 (les trois zones de vacances). Source : les communiqués de la SNCF.",
    closesAt: "2027-02-04T23:59:00+01:00",
    resolveBy: "2027-03-08T12:00:00+01:00",
    outcomes: [
      { label: "Oui", pct: 35, grogne: 100 },
      { label: "Non", pct: 65, grogne: -50 },
    ],
  },

  // ------------------------------------------------------------ Dans la rue
  {
    id: "mobilisation-decembre",
    symbol: "RUE.DEC",
    cat: "rue",
    title: "Une journée nationale de grève et de manifestations aura-t-elle lieu en décembre ?",
    rules:
      "Oui si au moins deux des cinq grandes confédérations syndicales (CGT, CFDT, FO, CFE-CGC, CFTC) appellent ensemble à une journée nationale de mobilisation qui a lieu entre le 1er et le 31 décembre 2026. Source : les communiqués des syndicats.",
    closesAt: "2026-12-10T23:59:00+01:00",
    resolveBy: "2026-12-31T20:00:00+01:00",
    outcomes: [
      { label: "Oui", pct: 40, grogne: 100 },
      { label: "Non", pct: 60, grogne: -50 },
    ],
  },
  {
    id: "ecart-des-chiffres",
    symbol: "ECART",
    cat: "rue",
    title: "Prochaine grande manifestation : quel écart entre le chiffre des syndicats et celui de la police ?",
    rules:
      "On prend la première journée nationale de manifestations organisée après le 28 novembre 2026, et on divise le total annoncé par la CGT par celui du ministère de l'Intérieur. Les mises ferment la veille du défilé. S'il n'y en a aucune avant le 31 mars 2027, ou s'il manque un des deux chiffres, le pari est annulé et tout le monde est remboursé.",
    closesAt: "2027-03-30T23:59:00+02:00",
    resolveBy: "2027-03-31T20:00:00+02:00",
    outcomes: [
      { label: "Moins du double", pct: 35, grogne: 0 },
      { label: "Du double au triple", pct: 45, grogne: 0 },
      { label: "Plus du triple", pct: 20, grogne: 0 },
    ],
  },
  {
    id: "premier-mai",
    symbol: "1ER.MAI",
    cat: "rue",
    title: "Combien de manifestants le 1er mai 2027, veille du second tour ?",
    rules:
      "Le total national des défilés du 1er mai 2027 annoncé par le ministère de l'Intérieur. Source : le communiqué du ministère, repris par les dépêches du soir.",
    closesAt: "2027-04-30T23:59:00+02:00",
    resolveBy: "2027-05-01T22:00:00+02:00",
    outcomes: [
      { label: "Moins de 100 000", pct: 15, grogne: -50 },
      { label: "De 100 000 à 200 000", pct: 45, grogne: 0 },
      { label: "De 200 000 à 300 000", pct: 25, grogne: 50 },
      { label: "Plus de 300 000", pct: 15, grogne: 100 },
    ],
  },

  // ------------------------------------------------------------ Course à 2027
  {
    id: "candidats",
    symbol: "CANDIDATS",
    cat: "elysee",
    title: "Combien de candidats sur la ligne de départ de la présidentielle ?",
    rules:
      "Le nombre de noms sur la liste officielle des candidats au premier tour, établie par le Conseil constitutionnel et publiée au Journal officiel. Pour mémoire : 12 en 2022, 11 en 2017, 10 en 2012.",
    closesAt: "2027-02-28T23:59:00+01:00",
    resolveBy: "2027-03-31T20:00:00+02:00",
    outcomes: [
      { label: "9 ou moins", pct: 15, grogne: 0 },
      { label: "10 ou 11", pct: 35, grogne: 0 },
      { label: "12 ou 13", pct: 35, grogne: 0 },
      { label: "14 ou plus", pct: 15, grogne: 0 },
    ],
  },
  {
    id: "participation",
    symbol: "URNES",
    cat: "elysee",
    title: "Quelle participation au premier tour de la présidentielle ?",
    rules:
      "Le taux de participation du premier tour (18 avril 2027) pour la France entière, d'après les résultats officiels proclamés par le Conseil constitutionnel. Les mises ferment à la fin de la campagne officielle. Pour mémoire : 73,7 % en 2022, 77,8 % en 2017.",
    closesAt: "2027-04-16T23:59:00+02:00",
    resolveBy: "2027-04-21T20:00:00+02:00",
    outcomes: [
      { label: "Moins de 70 %", pct: 20, grogne: 60 },
      { label: "De 70 à 75 %", pct: 40, grogne: 0 },
      { label: "Plus de 75 %", pct: 40, grogne: -60 },
    ],
  },
  {
    id: "debat",
    symbol: "DEBAT",
    cat: "elysee",
    title: "Y aura-t-il un débat télévisé entre les deux finalistes ?",
    rules:
      "Oui si les deux candidats qualifiés pour le second tour débattent face à face à la télévision entre le 18 et le 30 avril 2027. Les mises ferment avant le premier tour. Pour mémoire : il n'y en a pas eu en 2002.",
    closesAt: "2027-04-16T23:59:00+02:00",
    resolveBy: "2027-04-30T23:59:00+02:00",
    outcomes: [
      { label: "Oui", pct: 85, grogne: -30 },
      { label: "Non", pct: 15, grogne: 70 },
    ],
  },
  {
    id: "ecart-second-tour",
    symbol: "FINALE",
    cat: "elysee",
    title: "Second tour : moins de 10 points d'écart entre les deux finalistes ?",
    rules:
      "Oui si l'écart entre les deux candidats du second tour (2 mai 2027) est inférieur à 10 points de pourcentage des suffrages exprimés, d'après les résultats officiels. Les mises ferment à la fin de la campagne officielle. Pour mémoire : 17 points en 2022, 32 en 2017, 3 en 2012.",
    closesAt: "2027-04-30T23:59:00+02:00",
    resolveBy: "2027-05-05T20:00:00+02:00",
    outcomes: [
      { label: "Oui", pct: 55, grogne: 0 },
      { label: "Non", pct: 45, grogne: 0 },
    ],
  },

  // ------------------------------------------------------------ Hors-série
  {
    id: "voeux",
    symbol: "VOEUX",
    cat: "divers",
    title: "Vœux du 31 décembre : combien de temps parlera le président ?",
    rules:
      "La durée de l'allocution des vœux aux Français du 31 décembre 2026, du premier au dernier mot, mesurée sur la vidéo officielle publiée par l'Élysée.",
    closesAt: "2026-12-31T19:00:00+01:00",
    resolveBy: "2027-01-01T12:00:00+01:00",
    outcomes: [
      { label: "Moins de 10 minutes", pct: 30, grogne: 0 },
      { label: "De 10 à 15 minutes", pct: 45, grogne: 0 },
      { label: "Plus de 15 minutes", pct: 25, grogne: 0 },
    ],
  },
  {
    id: "neige-a-noel",
    symbol: "NEIGE",
    cat: "divers",
    title: "Neigera-t-il à Paris le jour de Noël ?",
    rules: "Oui si Météo-France relève une chute de neige à la station de Paris-Montsouris le 25 décembre 2026, même quelques flocons. Source : Météo-France.",
    closesAt: "2026-12-22T23:59:00+01:00",
    resolveBy: "2026-12-26T12:00:00+01:00",
    outcomes: [
      { label: "Oui", pct: 6, grogne: 0 },
      { label: "Non", pct: 94, grogne: 0 },
    ],
  },
  {
    id: "defi-apphero",
    symbol: "APPHERO",
    cat: "divers",
    title: "Apphéro ira-t-il au bout : 30 apps sorties à 18 h pile ?",
    rules:
      "Oui si les 30 apps du défi sont toutes sorties sur apphero.cloud, chacune à 18 h le jour prévu, la dernière le jeudi 17 décembre 2026. Une seule en retard, et c'est non. L'arbitre est juge et partie, mais il est honnête.",
    closesAt: "2026-12-10T23:59:00+01:00",
    resolveBy: "2026-12-17T19:00:00+01:00",
    outcomes: [
      { label: "Oui", pct: 75, grogne: 0 },
      { label: "Non", pct: 25, grogne: 0 },
    ],
  },
];
