// Golden set. Each case: [loophole, query, expectation]
// Expectation is one of:
//   {is: 'name'}        exact library image required
//   {oneOf: [...]}      any of these acceptable
//   {not: [...]}        must NOT return any of these (safety); any other answer ok
//   {abstain: true}     must not return a specific match
//   {notNonVeg: true}   must never return a non-vegetarian image
export const GOLDEN = [

// ── L1  Partial anchor: core matches, head is wrong/unknown ──────────────────
// The user's scenario: "chicken" is right but the dish word is not.
['L1', 'chicken bhuna',        {not: ['chicken-biryani-v5','chicken-fried-rice-v5','chicken-rice']}],
['L1', 'chicken chettinad',    {oneOf: ['chicken-chettinad-v5']}],
['L1', 'chicken xacuti',       {not: ['chicken-biryani-v5','chicken-65-v5']}],
['L1', 'chicken stroganoff',   {not: ['chicken-biryani-v5','chicken-fried-rice-v5']}],
['L1', 'mutton sukka',         {not: ['mutton-biryani-v5','mutton-biriyani']}],
['L1', 'paneer bhurji',        {not: ['paneer-butter-masala','paneer-65-v5']}],

// ── L2  Core-ingredient swap (the original fish-fry bug) ─────────────────────
['L2', 'dal fry',              {is: 'dal-fry-v5'}],
['L2', 'fish fry',             {is: 'fish-fry'}],
['L2', 'prawn fry',            {is: 'prawn-fry'}],
['L2', 'chicken fry',          {is: 'chicken-fry'}],
['L2', 'crab fry',             {is: 'crab-fry'}],
['L2', 'paneer 65',            {is: 'paneer-65-v5'}],
['L2', 'chicken 65',           {oneOf: ['chicken-65','chicken-65-v5']}],
['L2', 'fish 65',              {oneOf: ['fish-65-v5','fish-65-hot']}],
['L2', 'mushroom 65',          {is: 'mushroom-65'}],

// ── L3  Incidental token collision ───────────────────────────────────────────
['L3', 'ladies finger fry',    {notNonVeg: true}],
['L3', 'cottage cheese tikka', {notNonVeg: true}],
['L3', 'corn finger',          {notNonVeg: true}],

// ── L4  Diet violations seen in live production ──────────────────────────────
['L4', 'veg fried rice',       {notNonVeg: true, oneOf: ['veg-fried-rice-v5']}],
['L4', 'veg schezwan noodles', {notNonVeg: true, oneOf: ['veg-schezwan-noodles']}],
['L4', 'veg soft noodles',     {notNonVeg: true}],
['L4', 'tomato soup',          {notNonVeg: true, oneOf: ['cream-of-tomato-soup']}],
['L4', 'sweet corn soup',      {notNonVeg: true, oneOf: ['sweet-corn-soup']}],
['L4', 'veg soup',             {notNonVeg: true, oneOf: ['hot-veg-soup']}],
['L4', 'lemon coriander soup', {notNonVeg: true}],
['L4', 'mushroom tikka',       {notNonVeg: true, oneOf: ['mushroom-tikka']}],
['L4', 'tandoori gobi',        {notNonVeg: true, oneOf: ['tandoori-gobi']}],
['L4', 'dal tadka',            {notNonVeg: true, oneOf: ['dal-tadka-v5']}],
['L4', 'kadai veg',            {notNonVeg: true, oneOf: ['kadai-veg-subzi']}],
['L4', 'paneer malai tikka',   {notNonVeg: true, oneOf: ['malai-paneer-tikka']}],
['L4', 'coconut uthappam',     {notNonVeg: true, oneOf: ['uthappam']}],
['L4', 'veg chowmein',         {notNonVeg: true}],
['L4', 'aloo ghosht',          {not: ['mutton-biriyani','mutton-biryani-v5']}],

// ── L5  Generic stealing from specific / vice versa ──────────────────────────
['L5', 'mutton biryani',       {oneOf: ['mutton-biryani-v5','mutton-biriyani']}],
['L5', 'chicken biryani',      {oneOf: ['chicken-biryani-v5']}],
['L5', 'prawn biryani',        {oneOf: ['prawn-biryani','prawn-biriyani']}],
['L5', 'egg biryani',          {oneOf: ['egg-biryani','egg-biriyani']}],
['L5', 'veg biryani',          {oneOf: ['veg-biryani-v5']}],
['L5', 'biryani',              {oneOf: ['biriyani','plain-biryani']}],

// ── L6  Synonyms / one dish, several names ───────────────────────────────────
['L6', 'roti',                 {is: 'roti-chapathi'}],
['L6', 'chapati',              {is: 'roti-chapathi'}],
['L6', 'chapathi',             {is: 'roti-chapathi'}],
['L6', 'phulka',               {is: 'roti-chapathi'}],
['L6', 'curd rice',            {is: 'curd-rice'}],
['L6', 'thayir sadam',         {is: 'curd-rice'}],
['L6', 'meen varuval',         {is: 'fish-fry'}],
['L6', 'kozhi biryani',        {oneOf: ['chicken-biryani-v5']}],
['L6', 'eral biryani',         {oneOf: ['prawn-biryani','prawn-biriyani']}],
['L6', 'murgh tikka',          {oneOf: ['chicken-tikka','chicken-tikka-v5']}],
['L6', 'paruppu',              {oneOf: ['dal-fry-v5','dal-tadka-v5']}],
['L6', 'mor',                  {is: 'butter-milk'}],
['L6', 'vendakkai fry',        {notNonVeg: true}],

// ── L7  Typos and transliteration ────────────────────────────────────────────
['L7', 'chiken biriyani',      {oneOf: ['chicken-biryani-v5']}],
['L7', 'panner tikka',         {notNonVeg: true}],
['L7', 'mtton biriyani',       {oneOf: ['mutton-biryani-v5','mutton-biriyani']}],
['L7', 'chiken 65',            {oneOf: ['chicken-65','chicken-65-v5']}],
['L7', 'briyani',              {oneOf: ['biriyani','plain-biryani']}],
['L7', 'panner butter masala', {notNonVeg: true}],
['L7', 'parrota',              {is: 'parotta'}],

// ── L8  Word order ───────────────────────────────────────────────────────────
['L8', 'biryani chicken',      {oneOf: ['chicken-biryani-v5']}],
['L8', 'fry fish',             {is: 'fish-fry'}],
['L8', 'rice curd',            {is: 'curd-rice'}],

// ── L9  Modifier / portion noise ─────────────────────────────────────────────
['L9', 'special chicken biryani full',        {oneOf: ['chicken-biryani-v5']}],
['L9', 'chicken biryani (serves 2)',          {oneOf: ['chicken-biryani-v5']}],
['L9', 'mutton biryani - quarter/half/full',  {oneOf: ['mutton-biryani-v5','mutton-biriyani']}],
['L9', 'our famous chicken 65 [8 pcs]',       {oneOf: ['chicken-65','chicken-65-v5']}],
['L9', 'veg fried rice 250ml',                {notNonVeg: true}],

// ── L10 Cooking-method flip (same core, different look) ──────────────────────
['L10', 'chicken curry',       {not: ['chicken-fry','chicken-65','chicken-65-v5','chicken-biryani-v5']}],
['L10', 'fish curry',          {oneOf: ['fish-curry','fish-curry-v5']}],
['L10', 'chicken soup',        {is: 'chicken-soup'}],
['L10', 'chicken noodles',     {oneOf: ['chicken-noodles','chicken-noodles-v5','chicken-noodles-2']}],
['L10', 'chicken fried rice',  {oneOf: ['chicken-fried-rice-v5']}],
['L10', 'chicken tikka',       {oneOf: ['chicken-tikka','chicken-tikka-v5']}],

// ── L11 Multi-dish / combo names ─────────────────────────────────────────────
['L11', 'idli vada combo',                            {not: ['chicken-rice','chicken-fry']}],
['L11', 'veg fried rice with chilli gobi and coke',   {notNonVeg: true}],
['L11', 'veg. manchurian with fried rice / noodles',  {notNonVeg: true}],
['L11', 'naan plain butter garlic',                   {notNonVeg: true}],

// ── L12 Dish genuinely absent from the library ───────────────────────────────
['L12', 'kulcha',              {abstain: true}],
['L12', 'puttu',               {abstain: true}],
['L12', 'vellayappam',         {abstain: true}],
['L12', 'sirloin steak',       {abstain: true}],
['L12', 'turkish coffee',      {not: ['chicken-rice','chicken-fry']}],
['L12', 'lahori khurchan',     {abstain: true}],
['L12', 'ragi koozh',          {abstain: true}],
['L12', 'wheat khaboos',       {abstain: true}],

// ── L13 Junk / non-food input ────────────────────────────────────────────────
['L13', 'testing',             {abstain: true}],
['L13', 'food name',           {abstain: true}],
['L13', 'meal 1',              {abstain: true}],
['L13', 'panga',               {abstain: true}],
['L13', 'extra chicken piece', {abstain: true}],

// ── L14 Beverages & desserts ─────────────────────────────────────────────────
['L14', 'lemon juice',         {oneOf: ['lemon-juice','fresh-lemon-juice']}],
['L14', 'fresh lime soda',     {oneOf: ['fresh-lemon-soda','lemon-soda']}],
['L14', 'ginger tea',          {is: 'ginger-tea'}],
['L14', 'oreo milkshake',      {is: 'oreo-milkshake'}],
['L14', 'gulab jamun',         {is: 'gulab-jamun'}],
['L14', 'vanilla ice cream',   {oneOf: ['vanilla-ice-cream','ice-cream']}],

// ── L15 Head-noun present but no matching image ──────────────────────────────
['L15', 'chicken roll',        {not: ['chicken-rice','chicken-fry','chicken-biryani-v5']}],
['L15', 'veg roll',            {notNonVeg: true}],
['L15', 'paneer roll',         {notNonVeg: true}],
];
