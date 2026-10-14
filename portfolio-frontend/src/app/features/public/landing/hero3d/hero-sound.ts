/**
 * Sonidos del hero, sintetizados con Web Audio (sin archivos): un toque suave al señalar una
 * ficha, un «pop» al abrir el mazo o traer una al frente y un golpe sordo al rebotar. Apagados por
 * defecto: solo suenan si el visitante los enciende (se recuerda en `localStorage`), y el
 * contexto de audio se crea en el primer gesto, como exigen los navegadores.
 */
const STORAGE_KEY = 'hero-sound';

export class HeroSound {
  private context: AudioContext | null = null;
  enabled = readEnabled();

  toggle(): boolean {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(STORAGE_KEY, this.enabled ? 'on' : 'off');
    } catch {
      // Sin almacenamiento, la elección dura lo que la página.
    }
    if (!this.enabled) globalThis.speechSynthesis?.cancel();
    return this.enabled;
  }

  tick(): void {
    this.tone(1320, 0.04, 0.03, 'sine');
  }

  pop(): void {
    this.tone(520, 0.12, 0.08, 'triangle', 980);
  }

  bounce(): void {
    this.tone(140, 0.12, 0.09, 'sine', 70);
  }

  private tone(frequency: number, duration: number, volume: number, type: OscillatorType, to?: number): void {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      if (to) oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    } catch {
      // Sin Web Audio, en silencio.
    }
  }
}

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

/** Saludo según la hora local y, si se puede deducir, el lugar de la zona horaria (sin red). */
export function greeting(lang: 'en' | 'es', visits: number, now = new Date()): string {
  const hour = now.getHours();
  const place = timeZonePlace();
  if (visits > 1) return lang === 'en' ? 'Welcome back 👋' : '¡Otra vez por aquí! 👋';
  const part = hour < 6 ? 2 : hour < 12 ? 0 : hour < 19 ? 1 : 2;
  const hello = lang === 'en' ? ['Good morning', 'Good afternoon', 'Good evening'][part] : ['Buenos días', 'Buenas tardes', 'Buenas noches'][part];
  return place ? `${hello}, ${place} 👋` : `${hello} 👋`;
}

/** «America/El_Salvador» → «El Salvador». Nada de geolocalización: solo la zona del navegador. */
function timeZonePlace(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const city = zone?.split('/').pop()?.replace(/_/g, ' ');
    return city && city !== 'UTC' && !/^Etc/.test(zone) ? city : null;
  } catch {
    return null;
  }
}

/** Visitas a la página en este navegador (cuenta la actual). */
export function countVisit(): number {
  try {
    const visits = Number(localStorage.getItem('hero-visits') ?? '0') + 1;
    localStorage.setItem('hero-visits', String(visits));
    return visits;
  } catch {
    return 1;
  }
}

/**
 * La voz más natural disponible para el idioma: las voces neuronales o «premium» del sistema y del
 * navegador suenan humanas; las básicas, robóticas. Se puntúa por nombre y se elige la mejor.
 */
export function bestVoice(lang: 'en' | 'es'): SpeechSynthesisVoice | null {
  const voices = globalThis.speechSynthesis?.getVoices() ?? [];
  const candidates = voices.filter((voice) => voice.lang.toLowerCase().startsWith(lang));
  const score = (voice: SpeechSynthesisVoice): number => {
    const name = voice.name.toLowerCase();
    let points = 0;
    if (/natural|neural|online/.test(name)) points += 50; // Edge, Windows: voces neuronales
    if (/premium|enhanced|siri/.test(name)) points += 40; // macOS e iOS: voces mejoradas
    if (/google/.test(name)) points += 25; // Chrome: voces en la nube, bastante naturales
    if (/samantha|ava|allison|zoe|evan|nathan|paulina|m[oó]nica|jorge|diego|marisol|sof[ií]a|elena/.test(name)) points += 10;
    if (!voice.localService) points += 5;
    if (/compact|espeak|novelty|bad news|bells|whisper|zarvox|trinoids|albert/.test(name)) points -= 100;
    if (lang === 'es' && /es-(mx|us|419)/i.test(voice.lang)) points += 3; // acento latinoamericano
    return points;
  };
  return candidates.sort((a, b) => score(b) - score(a))[0] ?? null;
}
