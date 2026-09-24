export type SearchParams=Record<string,string|string[]|undefined>;
export function param(p:SearchParams,key:string,fallback=""){const v=p[key];return Array.isArray(v)?String(v[0]??fallback):String(v??fallback)}
export function n(v:unknown){const x=Number(v??0);return Number.isFinite(x)?x:0}
export function money(v:unknown){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n(v))}
export function qty(v:unknown){return new Intl.NumberFormat("id-ID",{maximumFractionDigits:4}).format(n(v))}
export function text(v:unknown,fallback="-"){const s=String(v??"").trim();return s||fallback}
export function pick(row:Record<string,unknown>|null|undefined,...keys:string[]){for(const k of keys){const v=row?.[k];if(v!==null&&v!==undefined&&String(v)!=="")return v}return null}
export function boolish(v:unknown){return ["TRUE","T","1","YA","YES"].includes(String(v??"").toUpperCase())}
