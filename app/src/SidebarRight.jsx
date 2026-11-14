import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);
export default function SidebarRight() {
  const [activeTab, setActiveTab] = useState('numbers');
  const [stats, setStats] = useState(null);
useEffect(() => {
    fetch('/data/stats.json')
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch((err) => console.error("Erreur stats:", err));
  }, []);

  const latestSeries = stats && stats.series && stats.series.length > 0 ? stats.series[stats.series.length - 1] : null;
  const classesData = latestSeries ? latestSeries.classes : null;
  const totalKm2 = classesData 
    ? (classesData.eau_km2 + classesData.vegetation_km2 + classesData.sol_nu_km2 + classesData.bati_km2) 
    : 100;

  const pctEau = classesData ? ((classesData.eau_km2 / totalKm2) * 100).toFixed(0) : 0;
  const pctVeg = classesData ? ((classesData.vegetation_km2 / totalKm2) * 100).toFixed(0) : 0;
  const pctSol = classesData ? ((classesData.sol_nu_km2 / totalKm2) * 100).toFixed(0) : 0;
  const pctBati = classesData ? ((classesData.bati_km2 / totalKm2) * 100).toFixed(0) : 0;

  const chartData = {
    labels: stats && stats.series ? stats.series.map((s) => s.date) : [],
    datasets: [
      {
        label: 'Surface en Eau (km²)',
        data: stats && stats.series ? stats.series.map((s) => s.classes ? s.classes.eau_km2 : 0) : [],
        borderColor: '#38edf6',
        backgroundColor: 'rgba(56, 237, 246, 0.2)',
        tension: 0.4,
        pointBackgroundColor: '#ff5353',
        pointRadius: 5,
      },
    ],
  };
  const chartOptions = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#9ca3af' } },
      y: { grid: { color: '#1f293d' }, ticks: { color: '#9ca3af' } },
    },
  };
  return (
    <aside className="w-80 h-full bg-[#111c2e] text-white p-4 flex flex-col border-l border-gray-800 overflow-y-auto">
      {/* Tab Navigation */}
      <div className="flex border-b border-gray-700 pb-2 mb-4 text-sm font-medium">
        <button
          onClick={() => setActiveTab('numbers')}
          className={`flex-1 py-1 text-center ${activeTab === 'numbers' ? 'text-[#38edf6] border-b-2 border-[#38edf6] font-bold' : 'text-gray-400'}`}
        >
          Numbers
        </button>
        <button
          onClick={() => setActiveTab('explain')}
          className={`flex-1 py-1 text-center ${activeTab === 'explain' ? 'text-[#38edf6] border-b-2 border-[#38edf6] font-bold' : 'text-gray-400'}`}
        >
          What am I seeing?
        </button>
      </div>

      {activeTab === 'numbers' && (
        <div className="space-y-6">
          {/* Main Quantification Metric */}
          <div>
            <div className="flex justify-between items-center">
              <span className="text-xs uppercase text-gray-400 font-semibold tracking-wider">Change Quantification</span>
              <span className="text-xs text-red-400 bg-red-950/50 px-2 py-0.5 rounded border border-red-800/50">Active</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-white">
                {classesData ? classesData.eau_km2 : '--'}
              </span>
              <span className="text-lg text-gray-400 font-medium">km²</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Total detected water surface ({latestSeries ? latestSeries.date : ''}).</p>
          </div>

          {/* Area by Land Class */}
          <div className="space-y-2">
            <span className="text-xs uppercase text-gray-400 font-semibold">Area by Land Class</span>
            
            {/* Dynamic Progress Bar */}
            <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden flex">
              {landClasses.map((item) => (
                <div 
                  key={item.key} 
                  style={{ width: `${getPct(item.val)}%` }} 
                  className={`${item.bg} h-full`} 
                  title={item.label}
                />
              ))}
            </div>

            {/* Factorized 2x2 Grid */}
            <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
              {landClasses.map((item) => (
                <div key={item.key} className="bg-[#18263e] p-2 rounded flex justify-between">
                  <span className={`${item.color} font-semibold`}>• {item.label}</span>
                  <span>{item.val !== undefined ? `${item.val} km² (${getPct(item.val)}%)` : '--'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Transition Matrix */}
          <div className="space-y-2">
            <span className="text-xs uppercase text-gray-400 font-semibold">Transition Matrix</span>
            <div className="bg-[#18263e] rounded p-3 text-xs space-y-2">
              <div className="flex justify-between border-b border-gray-700 pb-1">
                <span className="text-gray-300">Bare soil → Water</span>
                <span className="text-[#38edf6] font-bold">
                  {stats?.transitions?.[0] ? `${stats.transitions[0].sol_nu_to_eau_km2} km²` : '--'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Vegetation → Water</span>
                <span className="text-[#38edf6] font-bold">
                  {stats?.transitions?.[0] ? `${stats.transitions[0].vegetation_to_eau_km2} km²` : '--'}
                </span>
              </div>
            </div>
          </div>

          {/* Trend Chart */}
          <div className="space-y-2">
            <span className="text-xs uppercase text-gray-400 font-semibold">Water Extent Trend</span>
            <div className="bg-[#18263e] p-3 rounded">
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>
        </div>
      )}

      {/* Tab: What am I seeing? */}
      {activeTab === 'explain' && (
        <div className="text-xs text-gray-300 space-y-4">
          <h3 className="font-bold text-sm text-white">Why does radar see water?</h3>
          <p>Calm water acts as a specular reflector (mirror) for radar signals emitted by NISAR. The signal reflects away from the sensor, creating dark areas (low backscatter).</p>
          <div className="bg-[#18263e] p-3 rounded border border-gray-700">
            <span className="font-bold text-[#38edf6] block mb-1">HH vs HV Polarization:</span>
            HH polarization strongly highlights flooded areas and double-bounce scattering from inundated vegetation.
          </div>
        </div>
      )}
    </aside>
  );
}

