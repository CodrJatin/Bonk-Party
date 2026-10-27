// Game metadata shared by server and client.

export const MAX_PLAYERS = 10;
export const ROUND_OPTIONS = [3, 5, 7, 10];

export const COLORS = [
  '#ff4d6d', // watermelon
  '#ff9f1c', // orange
  '#ffd23f', // sunny
  '#8ac926', // lime
  '#06d6a0', // mint
  '#00bbf9', // sky
  '#3a86ff', // blue
  '#9b5de5', // grape
  '#ff70d8', // bubblegum
  '#f4f1de', // marshmallow
  '#b5754c', // cocoa
  '#7d8bae', // storm
];

export const HATS = ['none', 'party', 'tophat', 'horns', 'bow', 'antenna', 'sprout', 'cap'];
export const HAT_LABELS = ['No hat', 'Party hat', 'Top hat', 'Horns', 'Bow', 'Antenna', 'Sprout', 'Cap'];

export const EMOTES = ['😂', '😡', '😎', '👋'];

export const GAMES = {
  lobby: {
    name: 'Lobby', icon: '🎈', kind: 'none',
    tag: 'Bonk around while you wait',
    how: 'Move with WASD / arrows, DASH with space.',
  },
  sumo: {
    name: 'Sumo Ring', icon: '🥋', kind: 'elim',
    category: 'SURVIVAL', qualify: 'STAY ON PLATFORM',
    tag: 'Last blob on the platform wins',
    how: 'DASH into rivals to launch them off the edge. The ring keeps shrinking!',
    color: '#ff2a6d',
    grad: 'linear-gradient(135deg, #ff2a6d 0%, #ff6200 100%)',
  },
  potato: {
    name: 'Hot Potato', icon: '💣', kind: 'elim',
    category: 'SURVIVAL', qualify: 'PASS THE BOMB',
    tag: "Don't hold the bomb when it blows",
    how: 'Touch someone to pass the bomb. Bomb holders run faster. Boom = out.',
    color: '#ff416c',
    grad: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)',
  },
  coins: {
    name: 'Coin Frenzy', icon: '🪙', kind: 'score',
    category: 'SCORE HUNT', qualify: 'GRAB COINS',
    tag: 'Grab the most coins',
    how: 'Bonk rich players to make them spill. Big gold coins are worth 5. Coin rain at the end!',
    color: '#f7b733',
    grad: 'linear-gradient(135deg, #f7b733 0%, #fc4a1a 100%)',
  },
  turf: {
    name: 'Paint Panic', icon: '🎨', kind: 'score',
    category: 'TERRITORY', qualify: 'PAINT THE FLOOR',
    tag: 'Paint the most floor',
    how: 'Roll around to paint. Grab 💥 paint bombs for huge splats. Bonks splash your color too.',
    color: '#00bbf9',
    grad: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
  },
  dodge: {
    name: 'Dodgeball Mayhem', icon: '🏐', kind: 'elim',
    category: 'SURVIVAL', qualify: 'DODGE & ELIMINATE',
    tag: 'Last one with hearts wins',
    how: 'Roll over a ball to grab it, DASH to throw it the way you are moving. 3 hits and you are out.',
    color: '#9b5de5',
    grad: 'linear-gradient(135deg, #b224ef 0%, #7579ff 100%)',
  },
  crown: {
    name: 'Crown Thief', icon: '👑', kind: 'score',
    category: 'FINAL HUNT', qualify: 'HOLD THE CROWN',
    tag: 'Wear the crown the longest',
    how: 'Grab the crown and run! DASH into the king to steal it.',
    color: '#ffd700',
    grad: 'linear-gradient(135deg, #f9d423 0%, #ff4e50 100%)',
  },
};

export const GAME_ORDER = ['sumo', 'potato', 'coins', 'turf', 'dodge', 'crown'];
