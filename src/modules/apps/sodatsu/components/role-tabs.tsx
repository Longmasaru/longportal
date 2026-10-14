"use client";

import { useState } from "react";
import { ROLES } from "../content";

/** 立場(新人・中堅・ベテラン・リーダー)ごとの「自分にどう関係するか」を切り替えて見せる。 */
export function RoleTabs() {
  const [active, setActive] = useState(ROLES[0].key);
  const role = ROLES.find((r) => r.key === active) ?? ROLES[0];

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="立場" className="flex flex-wrap gap-2">
        {ROLES.map((r) => {
          const selected = r.key === active;
          return (
            <button
              key={r.key}
              type="button"
              role="tab"
              id={`sodatsu-tab-${r.key}`}
              aria-selected={selected}
              aria-controls="sodatsu-role-panel"
              onClick={() => setActive(r.key)}
              className={
                selected
                  ? "bg-brand01 border-brand01 border px-5 py-1.5 text-sm font-bold text-white"
                  : "border-brand01/20 text-brand01 hover:text-brand03 hover:border-brand03 border px-5 py-1.5 text-sm font-bold transition-colors"
              }
            >
              {r.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id="sodatsu-role-panel"
        aria-labelledby={`sodatsu-tab-${role.key}`}
        className="border-brand01/15 border p-5"
      >
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          {role.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
