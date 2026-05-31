import GuitarCanvas from './components/GuitarCanvas';

export default function App() {
    return (
        <div style={{ 
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0D0D0D',
            gap: '12px'
        }}>
            <h1 style={{ color: '#F5E6C8', fontSize: '1.4rem' }}>
                Virtual Guitar AI
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                Tay trái chọn hợp âm • Tay phải gảy dây
            </p>
            <GuitarCanvas />
        </div>
    );
}