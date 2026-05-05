import type { VisionPillarColor } from '@/lib/v2/types';

export const PILLAR_COLORS: Record<
  VisionPillarColor,
  { bg: string; text: string; accent: string; border: string }
> = {
  MINT: {
    bg: '#C8F5EC',
    text: '#0A6B5A',
    accent: '#0FC48A',
    border: 'rgba(10,107,90,0.20)',
  },
  LAVENDER: {
    bg: '#E4E0FF',
    text: '#4A3DAA',
    accent: '#7B68EE',
    border: 'rgba(74,61,170,0.20)',
  },
  PEACH: {
    bg: '#FFE5D0',
    text: '#8B4513',
    accent: '#E07B39',
    border: 'rgba(139,69,19,0.20)',
  },
  SKY: {
    bg: '#D0E8FF',
    text: '#1A4A8B',
    accent: '#3A8DE0',
    border: 'rgba(26,74,139,0.20)',
  },
  PINK: {
    bg: '#FFD6E8',
    text: '#8B1A4A',
    accent: '#E03A7B',
    border: 'rgba(139,26,74,0.20)',
  },
  LEMON: {
    bg: '#FFF3C4',
    text: '#7A5A00',
    accent: '#C8A000',
    border: 'rgba(122,90,0,0.20)',
  },
};
