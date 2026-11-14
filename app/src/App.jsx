import { useState } from 'react'
import heroImg from './assets/hero.png'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import './App.css'
import React from 'react';
import SidebarRight from './SidebarRight';

function App() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0b131f]">
      {/* Zone temporaire pour la carte du Dev A */}
      <main className="flex-1 flex items-center justify-center text-gray-500 border-r border-gray-800">
        <p>[ Zone Carte Leaflet - Dev A ]</p>
      </main>

      {/* Ta Sidebar - Dev B */}
      <SidebarRight />
    </div>
  );
}

export default App;