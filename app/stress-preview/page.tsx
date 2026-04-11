import { StressCard } from '@/components/today/stress-card';

export default function StressPreview() {
  return (
    <div style={{ background: '#f5f0e8', minHeight: '100vh', padding: '40px 24px', fontFamily: 'sans-serif' }}>
      <p style={{ textAlign: 'center', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#999', marginBottom: 32 }}>
        Stress card — Style Script preview
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 480, margin: '0 auto' }}>
        <StressCard summary="restored" stressHighMinutes={0} userName="Rudolph" />
        <StressCard summary="normal" stressHighMinutes={120} userName="Rudolph" />
        <StressCard summary="stressful" stressHighMinutes={240} userName="Rudolph" />
      </div>
    </div>
  );
}
