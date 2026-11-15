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
export default function SidebarRight({ selectedZone }) {
  const [activeTab, setActiveTab] = useState('numbers');
  const [stats, setStats] = useState(null);
  const [story, setStory] = useState(null);
useEffect(() => {
    fetch('/data/stats.json')
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch((err) => console.error("Error fetching stats:", err));

    fetch('/data/story.json')
      .then((res) => res.json())
      .then((data) => setStory(data))
      .catch((err) => console.error("Error fetching story:", err));
  }, []);

  const latestSeries = stats && stats.series && stats.series.length > 0 ? stats.series[stats.series.length - 1] : null;
  const classesData = latestSeries ? latestSeries.classes : null;
  const totalKm2 = classesData 
    ? (classesData.eau_km2 + classesData.vegetation_km2 + classesData.sol_nu_km2 + classesData.bati_km2) 
    : 100;

  const getPct = (val) => (classesData && val !== undefined ? ((val / totalKm2) * 100).toFixed(0) : 0);

  const landClasses = [
    { key: 'eau', label: 'Water', color: 'text-blue-400', bg: 'bg-blue-500', val: classesData?.eau_km2 },
    { key: 'veg', label: 'Vegetation', color: 'text-emerald-400', bg: 'bg-emerald-500', val: classesData?.vegetation_km2 },
    { key: 'sol', label: 'Bare Soil', color: 'text-amber-400', bg: 'bg-amber-600', val: classesData?.sol_nu_km2 },
    { key: 'bati', label: 'Built-up', color: 'text-gray-400', bg: 'bg-gray-500', val: classesData?.bati_km2 },
  ];

  const chartData = {
    labels: stats && stats.series ? stats.series.map((s) => s.date) : [],
    datasets: [
      {
        label: 'Water Surface Area (km²)',
        data: stats && stats.series ? stats.series.map((s) => (s.classes ? s.classes.eau_km2 : 0)) : [],
        borderColor: '#0ea5e9', // Sky-500 pour matcher Tailwind
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        backgroundColor: (context) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 160);
          gradient.addColorStop(0, 'rgba(14, 165, 233, 0.35)');
          gradient.addColorStop(1, 'rgba(14, 165, 233, 0.0)');
          return gradient;
        },
        pointBackgroundColor: '#38bdf8',
        pointBorderColor: '#0f172a',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ],
  };
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e293b',
        titleColor: '#f8fafc',
        bodyColor: '#38bdf8',
        borderColor: '#334155',
        borderWidth: 1,
        padding: 8,
        displayColors: false,
        callbacks: {
          label: (context) => `${context.parsed.y} km²`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { size: 10 } },
      },
      y: {
        grid: { color: '#1e293b', drawBorder: false },
        ticks: { 
          color: '#64748b', 
          font: { size: 10 },
          callback: (value) => `${value} km²`
        },
      },
    },
  };
  return (
    <aside className="w-full md:w-80 h-auto md:h-full h-full bg-slate-900 text-slate-100 p-4 flex flex-col border-l border-slate-800 overflow-y-auto">
      {/* Navigation */}
      <div className="flex border-b border-slate-800 pb-2 mb-4 text-xs font-semibold uppercase tracking-wider">
        <button
          onClick={() => setActiveTab('numbers')}
          className={`flex-1 py-1 text-center ${
            activeTab === 'numbers' ? 'text-sky-400 border-b-2 border-sky-400' : 'text-slate-400'
          }`}
        >
          Numbers
        </button>
        <button
          onClick={() => setActiveTab('explain')}
          className={`flex-1 py-1 text-center ${
            activeTab === 'explain' ? 'text-sky-400 border-b-2 border-sky-400' : 'text-slate-400'
          }`}
        >
          What am I seeing?
        </button>
      </div>

      {activeTab === 'numbers' && (
        <div className="space-y-5">
          {/* Main Quantification */}
          <div className="bg-slate-800/50 p-3 rounded border border-slate-700/50">
            <div className="flex justify-between items-center text-xs text-slate-400 font-semibold uppercase">
              <span>Change Quantification</span>
              <span className="text-red-400 bg-red-950/80 px-1.5 py-0.5 rounded text-[10px] border border-red-800/50">Active</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-white">
                {classesData ? classesData.eau_km2 : '--'}
              </span>
              <span className="text-sm font-semibold text-slate-400">km²</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">Total detected water surface ({latestSeries ? latestSeries.date : ''}).</p>
          </div>

          {/* Area by Land Class */}
          <div className="space-y-2">
            <span className="text-xs uppercase text-slate-400 font-semibold tracking-wider">Area by Land Class</span>
            
            <div className="w-full bg-slate-800 h-2 rounded overflow-hidden flex">
              {landClasses.map((item) => (
                <div 
                  key={item.key} 
                  style={{ width: `${getPct(item.val)}%` }} 
                  className={`${item.bg} h-full`} 
                  title={`${item.label}: ${item.val} km²`}
                />
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
              {landClasses.map((item) => (
                <div key={item.key} className="bg-slate-800/40 p-2 rounded border border-slate-700/40">
                    <div className={`font-semibold ${item.color}`}>• {item.label}</div>
                  <div className="text-slate-200 mt-0.5">
                    {item.val !== undefined ? `${item.val} km²` : '--'}
                    <span className="text-slate-400 text-[11px] ml-1">({getPct(item.val)}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Transition Matrix */}
          <div className="space-y-2">
            <span className="text-xs uppercase text-slate-400 font-semibold tracking-wider">Transition Matrix</span>
            <div className="bg-slate-800/40 rounded p-3 text-xs border border-slate-700/40 space-y-2">
              <div className="flex justify-between border-b border-slate-700/60 pb-1.5">
                <span className="text-slate-300">Bare soil → Water</span>
                <span className="text-sky-400 font-bold">
                  {stats?.transitions?.[0] ? `${stats.transitions[0].sol_nu_to_eau_km2} km²` : '--'}
                </span>
              </div>
              <div className="flex justify-between pt-0.5">
                <span className="text-slate-300">Vegetation → Water</span>
                <span className="text-sky-400 font-bold">
                  {stats?.transitions?.[0] ? `${stats.transitions[0].vegetation_to_eau_km2} km²` : '--'}
                </span>
              </div>
            </div>
          </div>

          {/* Water Extent Trend */}
<div className="space-y-2">
  <span className="text-xs uppercase text-slate-400 font-semibold tracking-wider">Water Extent Trend</span>
  <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/40 h-52">
    <Line data={chartData} options={chartOptions} />
  </div>
</div>
        </div>
      )}
      {/* Story */}
      {activeTab === 'explain' && (
        <div className="text-xs text-slate-300 space-y-3 leading-relaxed">
          <h3 className="font-semibold text-sm text-white">
            {story ? story.title : "Why does radar see water?"}
          </h3>
          <p>
            {story ? story.summary : "Calm water acts as a specular reflector for radar signals emitted by NISAR."}
          </p>

          {story?.details?.map((item, idx) => (
            <div key={idx} className="bg-slate-800/40 p-3 rounded border border-slate-700/40">
              <span className="font-semibold text-sky-400 block mb-1">{item.heading}:</span>
              {item.content}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
