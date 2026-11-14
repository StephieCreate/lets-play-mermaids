export default function OceanBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Deep gradient base */}
      <div className="absolute inset-0 bg-gradient-to-b from-abyss-900 via-abyss-950 to-abyss-900" />

      {/* Hero photo — dark underwater */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-15"
        style={{
          backgroundImage:
            'url(https://images.pexels.com/photos/17188077/pexels-photo-17188077.jpeg?auto=compress&cs=tinysrgb&w=1920)',
        }}
      />

      {/* Radial glow from top */}
      <div className="absolute inset-0 bg-radial-glow" />

      {/* Caustic light dapples */}
      <div className="absolute inset-0 bg-caustic" />

      {/* Drifting light orbs */}
      <div className="absolute left-[10%] top-[20%] h-72 w-72 rounded-full bg-abyss-400/8 blur-3xl animate-drift" />
      <div className="absolute right-[15%] top-[50%] h-96 w-96 rounded-full bg-foam-500/6 blur-3xl animate-drift" style={{ animationDelay: '4s' }} />
      <div className="absolute left-[40%] bottom-[10%] h-80 w-80 rounded-full bg-abyss-300/5 blur-3xl animate-drift" style={{ animationDelay: '8s' }} />

      {/* Vignette */}
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse at center, transparent 30%, rgba(3, 6, 15, 0.3) 100%)',
      }} />
    </div>
  );
}
