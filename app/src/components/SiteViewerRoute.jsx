/**
 * SiteViewerRoute — resolves #/site/<id> to a SiteMap.
 * Keeps the old standalone SiteMap route working.
 */
import { useSites } from "../hooks/useSites";
import SiteMap from "./SiteMap";
import { siteBase } from "../lib/api";

export default function SiteViewerRoute({ siteId }) {
  const { sites, status, error } = useSites();

  if (status === "loading") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#070e1c] text-[#bacac5] font-mono text-xs">
        Loading site info…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#070e1c] text-[#ffb4ab] font-mono text-xs">
        Failed to load sites index: {error}
      </div>
    );
  }

  const matched = sites.find((s) => s.site === siteId || s.id === siteId);
  if (!matched) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#070e1c] text-[#dce2f6] flex-col gap-4">
        <div className="p-6 rounded-2xl bg-[#151b2a] border border-[rgba(60,74,70,0.5)] text-center max-w-sm">
          <span className="material-symbols-outlined text-[36px] text-[#ffb4ab]">location_off</span>
          <h2 className="text-lg font-bold mt-2">Site not found</h2>
          <p className="text-xs text-[#bacac5] mt-1 mb-4">No site matching "{siteId}".</p>
          <a href="#/" className="px-4 py-2 rounded-xl bg-[#57f1db] text-[#003731] font-bold text-xs inline-block">
            Back to globe
          </a>
        </div>
      </div>
    );
  }

  const basePath = siteBase(matched);
  return (
    <div className="w-screen h-screen relative bg-[#070e1c] overflow-hidden">
      <SiteMap basePath={basePath} />
    </div>
  );
}
