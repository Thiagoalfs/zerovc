import { GuildEmoji } from '../types';

export interface EmojiDefinition {
  name: string;
  shortcodes: string[];
  unicode: string;
  category: 'smileys' | 'people' | 'animals' | 'food' | 'activities' | 'travel' | 'objects' | 'symbols' | 'flags';
  keywords?: string[];
}

export interface EmojiSuggestion {
  id: string;
  name: string;
  shortcode: string;
  unicode?: string;
  imageUrl?: string;
  isCustom?: boolean;
  guildName?: string;
}

export const EMOJI_DATABASE: EmojiDefinition[] = [
  // Smileys & Emotion
  { name: 'grinning', shortcodes: ['grinning', 'sorriso'], unicode: '😀', category: 'smileys' },
  { name: 'smiley', shortcodes: ['smiley', 'sorridente'], unicode: '😃', category: 'smileys' },
  { name: 'smile', shortcodes: ['smile', 'feliz'], unicode: '😄', category: 'smileys' },
  { name: 'grin', shortcodes: ['grin'], unicode: '😁', category: 'smileys' },
  { name: 'laughing', shortcodes: ['laughing', 'satisfied', 'gargalhada'], unicode: '😆', category: 'smileys' },
  { name: 'sweat_smile', shortcodes: ['sweat_smile'], unicode: '😅', category: 'smileys' },
  { name: 'rofl', shortcodes: ['rofl', 'rolando_de_rir'], unicode: '🤣', category: 'smileys' },
  { name: 'joy', shortcodes: ['joy', 'chorando_de_rir'], unicode: '😂', category: 'smileys' },
  { name: 'slightly_smiling_face', shortcodes: ['slightly_smiling_face', 'smile_soft'], unicode: '🙂', category: 'smileys' },
  { name: 'upside_down_face', shortcodes: ['upside_down_face', 'de_cabeca_para_baixo'], unicode: '🙃', category: 'smileys' },
  { name: 'wink', shortcodes: ['wink', 'piscadela'], unicode: '😉', category: 'smileys' },
  { name: 'blush', shortcodes: ['blush', 'envergonhado'], unicode: '😊', category: 'smileys' },
  { name: 'innocent', shortcodes: ['innocent', 'angel', 'anjo'], unicode: '😇', category: 'smileys' },
  { name: 'heart_eyes', shortcodes: ['heart_eyes', 'apaixonado'], unicode: '😍', category: 'smileys' },
  { name: 'star_struck', shortcodes: ['star_struck', 'estrelas'], unicode: '🤩', category: 'smileys' },
  { name: 'kissing_heart', shortcodes: ['kissing_heart', 'beijo', 'kiss'], unicode: '😘', category: 'smileys' },
  { name: 'kissing', shortcodes: ['kissing'], unicode: '😗', category: 'smileys' },
  { name: 'yum', shortcodes: ['yum', 'delicia', 'gostoso'], unicode: '😋', category: 'smileys' },
  { name: 'stuck_out_tongue', shortcodes: ['stuck_out_tongue', 'lingua'], unicode: '😛', category: 'smileys' },
  { name: 'stuck_out_tongue_winking_eye', shortcodes: ['stuck_out_tongue_winking_eye', 'zany_face'], unicode: '😜', category: 'smileys' },
  { name: 'zany_face', shortcodes: ['zany_face', 'doido'], unicode: '🤪', category: 'smileys' },
  { name: 'stuck_out_tongue_closed_eyes', shortcodes: ['stuck_out_tongue_closed_eyes', 'squinting_tongue'], unicode: '😝', category: 'smileys' },
  { name: 'money_mouth_face', shortcodes: ['money_mouth_face', 'dinheiro', 'rico'], unicode: '🤑', category: 'smileys' },
  { name: 'hugging_face', shortcodes: ['hugging_face', 'abraco', 'hug'], unicode: '🤗', category: 'smileys' },
  { name: 'hand_over_mouth', shortcodes: ['hand_over_mouth', 'eita', 'ops'], unicode: '🤭', category: 'smileys' },
  { name: 'shushing_face', shortcodes: ['shushing_face', 'silencio', 'shh'], unicode: '🤫', category: 'smileys' },
  { name: 'thinking', shortcodes: ['thinking', 'pensando', 'pensativo'], unicode: '🤔', category: 'smileys' },
  { name: 'zipper_mouth_face', shortcodes: ['zipper_mouth_face', 'bico_calado'], unicode: '🤐', category: 'smileys' },
  { name: 'raised_eyebrow', shortcodes: ['raised_eyebrow', 'desconfiado'], unicode: '🤨', category: 'smileys' },
  { name: 'neutral_face', shortcodes: ['neutral_face', 'neutro'], unicode: '😐', category: 'smileys' },
  { name: 'expressionless', shortcodes: ['expressionless', 'sem_expressao'], unicode: '😑', category: 'smileys' },
  { name: 'no_mouth', shortcodes: ['no_mouth'], unicode: '😶', category: 'smileys' },
  { name: 'smirk', shortcodes: ['smirk', 'safado'], unicode: '😏', category: 'smileys' },
  { name: 'unamused', shortcodes: ['unamused', 'chateado'], unicode: '😒', category: 'smileys' },
  { name: 'roll_eyes', shortcodes: ['roll_eyes', 'revirando_olhos'], unicode: '🙄', category: 'smileys' },
  { name: 'grimacing', shortcodes: ['grimacing', 'careta'], unicode: '😬', category: 'smileys' },
  { name: 'lying_face', shortcodes: ['lying_face', 'mentiroso', 'pinocchio'], unicode: '🤥', category: 'smileys' },
  { name: 'relieved', shortcodes: ['relieved', 'aliviado'], unicode: '😌', category: 'smileys' },
  { name: 'pensive', shortcodes: ['pensive', 'triste'], unicode: '😔', category: 'smileys' },
  { name: 'sleepy', shortcodes: ['sleepy', 'sono'], unicode: '😪', category: 'smileys' },
  { name: 'drooling_face', shortcodes: ['drooling_face', 'babando'], unicode: '🤤', category: 'smileys' },
  { name: 'sleeping', shortcodes: ['sleeping', 'dormindo', 'zzz'], unicode: '😴', category: 'smileys' },
  { name: 'mask', shortcodes: ['mask', 'mascara'], unicode: '😷', category: 'smileys' },
  { name: 'face_with_thermometer', shortcodes: ['face_with_thermometer', 'febre', 'doente'], unicode: '🤒', category: 'smileys' },
  { name: 'face_with_head_bandage', shortcodes: ['face_with_head_bandage', 'machucado'], unicode: '🤕', category: 'smileys' },
  { name: 'nauseated_face', shortcodes: ['nauseated_face', 'enjoado', 'vomito_leve'], unicode: '🤢', category: 'smileys' },
  { name: 'vomiting_face', shortcodes: ['vomiting_face', 'vomito'], unicode: '🤮', category: 'smileys' },
  { name: 'sneezing_face', shortcodes: ['sneezing_face', 'espirro'], unicode: '🤧', category: 'smileys' },
  { name: 'hot_face', shortcodes: ['hot_face', 'calor', 'quente'], unicode: '🥵', category: 'smileys' },
  { name: 'cold_face', shortcodes: ['cold_face', 'frio', 'gelado'], unicode: '🥶', category: 'smileys' },
  { name: 'woozy_face', shortcodes: ['woozy_face', 'bebado', 'tonto'], unicode: '🥴', category: 'smileys' },
  { name: 'dizzy_face', shortcodes: ['dizzy_face'], unicode: '😵', category: 'smileys' },
  { name: 'exploding_head', shortcodes: ['exploding_head', 'mente_explodida', 'mindblown'], unicode: '🤯', category: 'smileys' },
  { name: 'cowboy_hat_face', shortcodes: ['cowboy', 'cowboy_hat_face'], unicode: '🤠', category: 'smileys' },
  { name: 'partying_face', shortcodes: ['partying_face', 'festa', 'comemorando'], unicode: '🥳', category: 'smileys' },
  { name: 'sunglasses', shortcodes: ['sunglasses', 'oculos', 'estilo', 'cool'], unicode: '😎', category: 'smileys' },
  { name: 'nerd_face', shortcodes: ['nerd', 'nerd_face'], unicode: '🤓', category: 'smileys' },
  { name: 'monocle_face', shortcodes: ['monocle', 'monocle_face'], unicode: '🧐', category: 'smileys' },
  { name: 'confused', shortcodes: ['confused', 'confuso'], unicode: '😕', category: 'smileys' },
  { name: 'worried', shortcodes: ['worried', 'preocupado'], unicode: '😟', category: 'smileys' },
  { name: 'slight_frown', shortcodes: ['slight_frown'], unicode: '🙁', category: 'smileys' },
  { name: 'open_mouth', shortcodes: ['open_mouth', 'boca_aberta'], unicode: '😮', category: 'smileys' },
  { name: 'hushed', shortcodes: ['hushed'], unicode: '😯', category: 'smileys' },
  { name: 'astonished', shortcodes: ['astonished', 'chocado'], unicode: '😲', category: 'smileys' },
  { name: 'flushed', shortcodes: ['flushed', 'corado'], unicode: '😳', category: 'smileys' },
  { name: 'pleading_face', shortcodes: ['pleading_face', 'por_favor', 'olhar_pidonho'], unicode: '🥺', category: 'smileys' },
  { name: 'frowning', shortcodes: ['frowning'], unicode: '😦', category: 'smileys' },
  { name: 'anguished', shortcodes: ['anguished'], unicode: '😧', category: 'smileys' },
  { name: 'fearful', shortcodes: ['fearful', 'medo'], unicode: '😨', category: 'smileys' },
  { name: 'cold_sweat', shortcodes: ['cold_sweat', 'suor_frio'], unicode: '😰', category: 'smileys' },
  { name: 'disappointed_relieved', shortcodes: ['disappointed_relieved'], unicode: '😥', category: 'smileys' },
  { name: 'cry', shortcodes: ['cry', 'chorando', 'choro'], unicode: '😢', category: 'smileys' },
  { name: 'sob', shortcodes: ['sob', 'desesperado_choro', 'pranto'], unicode: '😭', category: 'smileys' },
  { name: 'scream', shortcodes: ['scream', 'grito', 'panico'], unicode: '😱', category: 'smileys' },
  { name: 'confounded', shortcodes: ['confounded'], unicode: '😖', category: 'smileys' },
  { name: 'persevere', shortcodes: ['persevere'], unicode: '😣', category: 'smileys' },
  { name: 'disappointed', shortcodes: ['disappointed', 'decepcionado'], unicode: '😞', category: 'smileys' },
  { name: 'sweat', shortcodes: ['sweat'], unicode: '😓', category: 'smileys' },
  { name: 'weary', shortcodes: ['weary'], unicode: '😩', category: 'smileys' },
  { name: 'tired_face', shortcodes: ['tired_face', 'cansado'], unicode: '😫', category: 'smileys' },
  { name: 'yawn', shortcodes: ['yawn', 'bocejo'], unicode: '🥱', category: 'smileys' },
  { name: 'triumph', shortcodes: ['triumph', 'bravo_ar'], unicode: '😤', category: 'smileys' },
  { name: 'rage', shortcodes: ['rage', 'pouter', 'raiva_vermelho'], unicode: '😡', category: 'smileys' },
  { name: 'angry', shortcodes: ['angry', 'raiva', 'furioso'], unicode: '😠', category: 'smileys' },
  { name: 'cursing_face', shortcodes: ['cursing_face', 'xingamento', 'boca_suja'], unicode: '🤬', category: 'smileys' },
  { name: 'skull', shortcodes: ['skull', 'caveira', 'morto'], unicode: '💀', category: 'smileys' },
  { name: 'skull_crossbones', shortcodes: ['skull_crossbones'], unicode: '☠️', category: 'smileys' },
  { name: 'poop', shortcodes: ['poop', 'coco', 'shit'], unicode: '💩', category: 'smileys' },
  { name: 'clown_face', shortcodes: ['clown', 'clown_face', 'palhaco'], unicode: '🤡', category: 'smileys' },
  { name: 'ghost', shortcodes: ['ghost', 'fantasma'], unicode: '👻', category: 'smileys' },
  { name: 'alien', shortcodes: ['alien', 'et'], unicode: '👽', category: 'smileys' },
  { name: 'robot', shortcodes: ['robot', 'robo'], unicode: '🤖', category: 'smileys' },
  { name: 'sparkles', shortcodes: ['sparkles', 'brilho', 'brilhos'], unicode: '✨', category: 'smileys' },
  { name: 'fire', shortcodes: ['fire', 'fogo', 'chama'], unicode: '🔥', category: 'smileys' },
  { name: '100', shortcodes: ['100', 'cem'], unicode: '💯', category: 'smileys' },
  { name: 'heart', shortcodes: ['heart', 'coracao', 'love'], unicode: '❤️', category: 'smileys' },
  { name: 'orange_heart', shortcodes: ['orange_heart'], unicode: '🧡', category: 'smileys' },
  { name: 'yellow_heart', shortcodes: ['yellow_heart'], unicode: '💛', category: 'smileys' },
  { name: 'green_heart', shortcodes: ['green_heart'], unicode: '💚', category: 'smileys' },
  { name: 'blue_heart', shortcodes: ['blue_heart'], unicode: '💙', category: 'smileys' },
  { name: 'purple_heart', shortcodes: ['purple_heart'], unicode: '💜', category: 'smileys' },
  { name: 'black_heart', shortcodes: ['black_heart'], unicode: '🖤', category: 'smileys' },
  { name: 'white_heart', shortcodes: ['white_heart'], unicode: '🤍', category: 'smileys' },
  { name: 'broken_heart', shortcodes: ['broken_heart', 'coracao_partido'], unicode: '💔', category: 'smileys' },
  { name: 'sparkling_heart', shortcodes: ['sparkling_heart'], unicode: '💖', category: 'smileys' },
  { name: 'two_hearts', shortcodes: ['two_hearts'], unicode: '💕', category: 'smileys' },

  // Gestures & Body
  { name: 'thumbsup', shortcodes: ['thumbsup', 'thumbs_up', '+1', 'like', 'joinha'], unicode: '👍', category: 'people' },
  { name: 'thumbsdown', shortcodes: ['thumbsdown', 'thumbs_down', '-1', 'dislike'], unicode: '👎', category: 'people' },
  { name: 'clap', shortcodes: ['clap', 'palmas'], unicode: '👏', category: 'people' },
  { name: 'raised_hands', shortcodes: ['raised_hands', 'aleluia'], unicode: '🙌', category: 'people' },
  { name: 'pray', shortcodes: ['pray', 'rezar', 'obrigado', 'por_favor'], unicode: '🙏', category: 'people' },
  { name: 'handshake', shortcodes: ['handshake', 'aperto_de_mao'], unicode: '🤝', category: 'people' },
  { name: 'fist', shortcodes: ['fist', 'punho', 'soco'], unicode: '✊', category: 'people' },
  { name: 'wave', shortcodes: ['wave', 'tchau', 'ola', 'acenando'], unicode: '👋', category: 'people' },
  { name: 'eyes', shortcodes: ['eyes', 'olhos', 'olhando'], unicode: '👀', category: 'people' },
  { name: 'saluting_face', shortcodes: ['salute', 'saluting_face', 'continencia'], unicode: '🫡', category: 'people' },
  { name: 'muscle', shortcodes: ['muscle', 'forca', 'musculo'], unicode: '💪', category: 'people' },
  { name: 'point_up', shortcodes: ['point_up', 'apontar_cima'], unicode: '☝️', category: 'people' },
  { name: 'point_down', shortcodes: ['point_down', 'apontar_baixo'], unicode: '👇', category: 'people' },
  { name: 'point_left', shortcodes: ['point_left'], unicode: '👈', category: 'people' },
  { name: 'point_right', shortcodes: ['point_right'], unicode: '👉', category: 'people' },
  { name: 'middle_finger', shortcodes: ['middle_finger', 'dedo_do_meio'], unicode: '🖕', category: 'people' },
  { name: 'call_me_hand', shortcodes: ['call_me', 'shaka'], unicode: '🤙', category: 'people' },
  { name: 'ok_hand', shortcodes: ['ok_hand', 'ok'], unicode: '👌', category: 'people' },
  { name: 'pinched_fingers', shortcodes: ['pinched_fingers', 'chef_kiss', 'italiano'], unicode: '🤌', category: 'people' },

  // Animals & Nature
  { name: 'dog', shortcodes: ['dog', 'cachorro', 'cao'], unicode: '🐶', category: 'animals' },
  { name: 'cat', shortcodes: ['cat', 'gato'], unicode: '🐱', category: 'animals' },
  { name: 'mouse', shortcodes: ['mouse', 'rato'], unicode: '🐭', category: 'animals' },
  { name: 'hamster', shortcodes: ['hamster'], unicode: '🐹', category: 'animals' },
  { name: 'rabbit', shortcodes: ['rabbit', 'coelho'], unicode: '🐰', category: 'animals' },
  { name: 'fox_face', shortcodes: ['fox', 'raposa'], unicode: '🦊', category: 'animals' },
  { name: 'bear', shortcodes: ['bear', 'urso'], unicode: '🐻', category: 'animals' },
  { name: 'panda_face', shortcodes: ['panda'], unicode: '🐼', category: 'animals' },
  { name: 'koala', shortcodes: ['koala'], unicode: '🐨', category: 'animals' },
  { name: 'tiger', shortcodes: ['tiger', 'tigre'], unicode: '🐯', category: 'animals' },
  { name: 'lion', shortcodes: ['lion', 'leao'], unicode: '🦁', category: 'animals' },
  { name: 'cow', shortcodes: ['cow', 'vaca'], unicode: '🐮', category: 'animals' },
  { name: 'pig', shortcodes: ['pig', 'porco'], unicode: '🐷', category: 'animals' },
  { name: 'frog', shortcodes: ['frog', 'sapo'], unicode: '🐸', category: 'animals' },
  { name: 'monkey_face', shortcodes: ['monkey', 'macaco'], unicode: '🐵', category: 'animals' },
  { name: 'see_no_evil', shortcodes: ['see_no_evil', 'macaco_olhos'], unicode: '🙈', category: 'animals' },
  { name: 'hear_no_evil', shortcodes: ['hear_no_evil', 'macaco_ouvidos'], unicode: '🙉', category: 'animals' },
  { name: 'speak_no_evil', shortcodes: ['speak_no_evil', 'macaco_boca'], unicode: '🙊', category: 'animals' },
  { name: 'penguin', shortcodes: ['penguin', 'pinguim'], unicode: '🐧', category: 'animals' },
  { name: 'bird', shortcodes: ['bird', 'passaro'], unicode: '🐦', category: 'animals' },
  { name: 'eagle', shortcodes: ['eagle', 'aguia'], unicode: '🦅', category: 'animals' },
  { name: 'duck', shortcodes: ['duck', 'pato'], unicode: '🦆', category: 'animals' },
  { name: 'owl', shortcodes: ['owl', 'coruja'], unicode: '🦉', category: 'animals' },
  { name: 'bat', shortcodes: ['bat', 'morcego'], unicode: '🦇', category: 'animals' },
  { name: 'wolf', shortcodes: ['wolf', 'lobo'], unicode: '🐺', category: 'animals' },
  { name: 'unicorn', shortcodes: ['unicorn', 'unicornio'], unicode: '🦄', category: 'animals' },
  { name: 'bee', shortcodes: ['bee', 'abelha'], unicode: '🐝', category: 'animals' },
  { name: 'bug', shortcodes: ['bug', 'inseto'], unicode: '🐛', category: 'animals' },
  { name: 'butterfly', shortcodes: ['butterfly', 'borboleta'], unicode: '🦋', category: 'animals' },
  { name: 'spider', shortcodes: ['spider', 'aranha'], unicode: '🕷️', category: 'animals' },
  { name: 'snake', shortcodes: ['snake', 'cobra'], unicode: '🐍', category: 'animals' },
  { name: 'turtle', shortcodes: ['turtle', 'tartaruga'], unicode: '🐢', category: 'animals' },
  { name: 't_rex', shortcodes: ['dinosaur', 'trex', 'dinossauro'], unicode: '🦖', category: 'animals' },
  { name: 'octopus', shortcodes: ['octopus', 'polvo'], unicode: '🐙', category: 'animals' },
  { name: 'fish', shortcodes: ['fish', 'peixe'], unicode: '🐟', category: 'animals' },
  { name: 'shark', shortcodes: ['shark', 'tubarao'], unicode: '🦈', category: 'animals' },
  { name: 'dolphin', shortcodes: ['dolphin', 'golfinho'], unicode: '🐬', category: 'animals' },
  { name: 'whale', shortcodes: ['whale', 'baleia'], unicode: '🐳', category: 'animals' },

  // Food & Drink
  { name: 'pizza', shortcodes: ['pizza'], unicode: '🍕', category: 'food' },
  { name: 'hamburger', shortcodes: ['burger', 'hamburger', 'hamburguer'], unicode: '🍔', category: 'food' },
  { name: 'fries', shortcodes: ['fries', 'batata_frita'], unicode: '🍟', category: 'food' },
  { name: 'hotdog', shortcodes: ['hotdog', 'cachorro_quente'], unicode: '🌭', category: 'food' },
  { name: 'popcorn', shortcodes: ['popcorn', 'pipoca'], unicode: '🍿', category: 'food' },
  { name: 'bacon', shortcodes: ['bacon'], unicode: '🥓', category: 'food' },
  { name: 'egg', shortcodes: ['egg', 'ovo'], unicode: '🥚', category: 'food' },
  { name: 'taco', shortcodes: ['taco'], unicode: '🌮', category: 'food' },
  { name: 'burrito', shortcodes: ['burrito'], unicode: '🌯', category: 'food' },
  { name: 'sushi', shortcodes: ['sushi'], unicode: '🍣', category: 'food' },
  { name: 'ramen', shortcodes: ['ramen', 'miojo'], unicode: '🍜', category: 'food' },
  { name: 'cookie', shortcodes: ['cookie', 'biscoito'], unicode: '🍪', category: 'food' },
  { name: 'cake', shortcodes: ['cake', 'bolo'], unicode: '🍰', category: 'food' },
  { name: 'birthday', shortcodes: ['birthday', 'bolo_aniversario'], unicode: '🎂', category: 'food' },
  { name: 'donut', shortcodes: ['donut', 'rosquinha'], unicode: '🍩', category: 'food' },
  { name: 'chocolate_bar', shortcodes: ['chocolate', 'chocolate_bar'], unicode: '🍫', category: 'food' },
  { name: 'coffee', shortcodes: ['coffee', 'cafe'], unicode: '☕', category: 'food' },
  { name: 'tea', shortcodes: ['tea', 'cha'], unicode: '🍵', category: 'food' },
  { name: 'beer', shortcodes: ['beer', 'cerveja'], unicode: '🍺', category: 'food' },
  { name: 'beers', shortcodes: ['beers', 'brinde', 'cervejas'], unicode: '🍻', category: 'food' },
  { name: 'wine_glass', shortcodes: ['wine', 'vinho'], unicode: '🍷', category: 'food' },
  { name: 'cocktail', shortcodes: ['cocktail', 'drink'], unicode: '🍸', category: 'food' },

  // Activities & Gaming & Celebrations
  { name: 'tada', shortcodes: ['tada', 'party', 'festa', 'confete'], unicode: '🎉', category: 'activities' },
  { name: 'video_game', shortcodes: ['game', 'videogame', 'controle', 'gaming'], unicode: '🎮', category: 'activities' },
  { name: 'joystick', shortcodes: ['joystick'], unicode: '🕹️', category: 'activities' },
  { name: 'trophy', shortcodes: ['trophy', 'trofeu', 'campeao'], unicode: '🏆', category: 'activities' },
  { name: 'medal', shortcodes: ['medal', 'medalha'], unicode: '🥇', category: 'activities' },
  { name: 'soccer', shortcodes: ['soccer', 'futebol', 'bola'], unicode: '⚽', category: 'activities' },
  { name: 'basketball', shortcodes: ['basketball', 'basquete'], unicode: '🏀', category: 'activities' },
  { name: 'headphones', shortcodes: ['headphones', 'fone', 'musica'], unicode: '🎧', category: 'activities' },
  { name: 'microphone', shortcodes: ['microphone', 'mic', 'microfone'], unicode: '🎤', category: 'activities' },
  { name: 'musical_note', shortcodes: ['musical_note', 'nota_musical'], unicode: '🎵', category: 'activities' },
  { name: 'guitar', shortcodes: ['guitar', 'violao', 'guitarra'], unicode: '🎸', category: 'activities' },
  { name: 'balloon', shortcodes: ['balloon', 'balao'], unicode: '🎈', category: 'activities' },
  { name: 'gift', shortcodes: ['gift', 'presente'], unicode: '🎁', category: 'activities' },

  // Objects & Symbols & Tech
  { name: 'rocket', shortcodes: ['rocket', 'foguete'], unicode: '🚀', category: 'travel' },
  { name: 'gem', shortcodes: ['gem', 'diamante', 'joia'], unicode: '💎', category: 'objects' },
  { name: 'crown', shortcodes: ['crown', 'coroa', 'rei'], unicode: '👑', category: 'objects' },
  { name: 'moneybag', shortcodes: ['moneybag', 'saco_de_dinheiro'], unicode: '💰', category: 'objects' },
  { name: 'zap', shortcodes: ['zap', 'lightning', 'raio'], unicode: '⚡', category: 'objects' },
  { name: 'bell', shortcodes: ['bell', 'sino', 'notificacao'], unicode: '🔔', category: 'objects' },
  { name: 'warning', shortcodes: ['warning', 'aviso', 'alerta'], unicode: '⚠️', category: 'symbols' },
  { name: 'check', shortcodes: ['check', 'certo', 'ok_check'], unicode: '✔️', category: 'symbols' },
  { name: 'x', shortcodes: ['x', 'errado', 'cross_mark'], unicode: '❌', category: 'symbols' },
  { name: 'question', shortcodes: ['question', 'duvida', 'interrogacao'], unicode: '❓', category: 'symbols' },
  { name: 'exclamation', shortcodes: ['exclamation', 'exclamacao'], unicode: '❗', category: 'symbols' },
  { name: 'rainbow', shortcodes: ['rainbow', 'arco_iris'], unicode: '🌈', category: 'symbols' },
  { name: 'star', shortcodes: ['star', 'estrela'], unicode: '⭐', category: 'symbols' },
  { name: 'glowing_star', shortcodes: ['star2', 'glowing_star'], unicode: '🌟', category: 'symbols' },
  { name: 'sun', shortcodes: ['sun', 'sol'], unicode: '☀️', category: 'symbols' },
  { name: 'moon', shortcodes: ['moon', 'lua'], unicode: '🌙', category: 'symbols' },
  { name: 'snowflake', shortcodes: ['snowflake', 'neve'], unicode: '❄️', category: 'symbols' },
  { name: 'cloud', shortcodes: ['cloud', 'nuvem'], unicode: '☁️', category: 'symbols' },
  { name: 'earth', shortcodes: ['earth', 'terra', 'mundo'], unicode: '🌍', category: 'travel' },
  { name: 'computer', shortcodes: ['computer', 'computador', 'pc'], unicode: '💻', category: 'objects' },
  { name: 'phone', shortcodes: ['phone', 'celular', 'telefone'], unicode: '📱', category: 'objects' },
  { name: 'shield', shortcodes: ['shield', 'escudo'], unicode: '🛡️', category: 'objects' },
  { name: 'sword', shortcodes: ['sword', 'espada'], unicode: '⚔️', category: 'objects' },
  { name: 'bomb', shortcodes: ['bomb', 'bomba'], unicode: '💣', category: 'objects' },
  { name: 'hammer', shortcodes: ['hammer', 'martelo'], unicode: '🔨', category: 'objects' },
  { name: 'wrench', shortcodes: ['wrench', 'chave_inglesa'], unicode: '🔧', category: 'objects' },
  { name: 'gear', shortcodes: ['gear', 'engrenagem'], unicode: '⚙️', category: 'objects' },
  { name: 'lock', shortcodes: ['lock', 'cadeado'], unicode: '🔒', category: 'objects' },
  { name: 'key', shortcodes: ['key', 'chave'], unicode: '🔑', category: 'objects' },
  { name: 'link', shortcodes: ['link', 'elo'], unicode: '🔗', category: 'objects' },
  { name: 'camera', shortcodes: ['camera', 'foto'], unicode: '📷', category: 'objects' },
  { name: 'pin', shortcodes: ['pin', 'alfinete'], unicode: '📌', category: 'objects' },
  { name: 'hourglass', shortcodes: ['hourglass', 'ampulheta'], unicode: '⏳', category: 'objects' },
  { name: 'recycle', shortcodes: ['recycle', 'reciclar'], unicode: '♻️', category: 'symbols' },
];

// Quick shortcode to Unicode lookup map
export const SHORTCODE_TO_UNICODE: Map<string, string> = new Map();
for (const entry of EMOJI_DATABASE) {
  for (const sc of entry.shortcodes) {
    SHORTCODE_TO_UNICODE.set(sc.toLowerCase(), entry.unicode);
  }
}

/**
 * Search emoji suggestions for autocomplete popup
 */
export function searchEmojiSuggestions(
  query: string,
  guildEmojis?: GuildEmoji[],
  guildName?: string,
  maxResults = 8
): EmojiSuggestion[] {
  const q = query.toLowerCase().trim();
  const results: EmojiSuggestion[] = [];

  // 1. First priority: Matching Custom Server Emojis
  if (guildEmojis && guildEmojis.length > 0) {
    for (const ge of guildEmojis) {
      const eName = ge.name.toLowerCase();
      if (!q || eName.includes(q)) {
        results.push({
          id: ge.id,
          name: ge.name,
          shortcode: `:${ge.name}:`,
          imageUrl: ge.image_url,
          isCustom: true,
          guildName: guildName || 'Servidor',
        });
        if (results.length >= maxResults) return results;
      }
    }
  }

  // 2. Second priority: Standard Unicode Emojis
  const matchedEntries = new Set<string>();

  // A. Exact / prefix matches on shortcode
  for (const entry of EMOJI_DATABASE) {
    const primarySc = entry.shortcodes[0];
    const match = entry.shortcodes.some((sc) => sc.toLowerCase().startsWith(q));
    if (match && !matchedEntries.has(primarySc)) {
      matchedEntries.add(primarySc);
      results.push({
        id: `std-${primarySc}`,
        name: entry.name,
        shortcode: `:${primarySc}:`,
        unicode: entry.unicode,
        isCustom: false,
      });
      if (results.length >= maxResults) return results;
    }
  }

  // B. Partial substring matches
  if (q.length >= 2) {
    for (const entry of EMOJI_DATABASE) {
      const primarySc = entry.shortcodes[0];
      if (matchedEntries.has(primarySc)) continue;

      const match = entry.shortcodes.some((sc) => sc.toLowerCase().includes(q));
      if (match) {
        matchedEntries.add(primarySc);
        results.push({
          id: `std-${primarySc}`,
          name: entry.name,
          shortcode: `:${primarySc}:`,
          unicode: entry.unicode,
          isCustom: false,
        });
        if (results.length >= maxResults) return results;
      }
    }
  }

  return results;
}

/**
 * Replace inline shortcodes like :thumbs_up: or :fire: in a message text
 * with their unicode or custom emoji representation.
 */
export function replaceEmojiShortcodes(
  text: string,
  guildEmojis?: GuildEmoji[]
): string {
  if (!text || !text.includes(':')) return text;

  // Build map of custom emojis by name
  const customMap = new Map<string, GuildEmoji>();
  if (guildEmojis) {
    for (const ge of guildEmojis) {
      customMap.set(ge.name.toLowerCase(), ge);
    }
  }

  // Match either existing custom emoji tag <:name:url> OR standalone :name:
  return text.replace(/(<:[a-zA-Z0-9_+-]+:[^>]+>)|:([a-zA-Z0-9_+-]+):/g, (match, existingTag, code) => {
    // If it's already an formatted custom emoji tag <:name:url>, leave it intact!
    if (existingTag) {
      return existingTag;
    }

    const cleanCode = (code || '').toLowerCase();

    // Custom server emojis should remain clean shortcodes :name:
    if (customMap.has(cleanCode)) {
      return match;
    }

    // Check standard emojis
    const unicode = SHORTCODE_TO_UNICODE.get(cleanCode);
    if (unicode) {
      return unicode;
    }

    return match;
  });
}

/**
 * Check if the text consists exclusively of 1 to 4 emojis (for Jumboji display)
 */
export function isPureEmojiMessage(content: string, guildEmojis?: GuildEmoji[]): boolean {
  if (!content) return false;
  const trimmed = content.trim();

  // Pattern for custom emoji tag <:name:url> or :name:
  const customEmojiTagRegex = /^<:[a-zA-Z0-9_+-]+:[^>]+>$/;
  const shortcodeRegex = /^:([a-zA-Z0-9_+-]+):$/;

  // Split by whitespace
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 5) return false;

  const customSet = new Set<string>();
  if (guildEmojis) {
    for (const ge of guildEmojis) {
      customSet.add(ge.name.toLowerCase());
    }
  }

  for (const token of tokens) {
    if (customEmojiTagRegex.test(token)) {
      continue;
    }

    const scMatch = token.match(shortcodeRegex);
    if (scMatch) {
      const code = scMatch[1].toLowerCase();
      if (customSet.has(code) || SHORTCODE_TO_UNICODE.has(code)) {
        continue;
      }
    }

    // Check if token is a standard emoji (using unicode regex or database)
    const isSingleEmoji = /^\p{Extended_Pictographic}+$/u.test(token);
    if (!isSingleEmoji) {
      return false;
    }
  }

  return true;
}
