import React, { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { useBranding, DEFAULT_CERTIFICATE_FOOTER } from '../../../lib/branding';

// The certificate as the organizer edits it — the same layout rules as
// the server renderer (apps/api/src/services/certificateRenderer.ts):
// positions are % of the page, font sizes are per 1000 px of page width,
// text starts at the top of its box and wraps inside its width. The
// bottom band (from footerTop %) is the fixed footer, not editable.

function fillTokens(text, values) {
  return (text || '').replace(/\{(\w+)\}/g, (m, key) => (key in values ? values[key] : m));
}

function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const update = () => setWidth(ref.current?.getBoundingClientRect().width || 0);
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return width || 1000;
}

function BuiltInFrame({ w }) {
  const b = w * 0.022;
  return (
    <div
      className="absolute inset-0"
      style={{ background: 'radial-gradient(circle, #ffffff 0%, #f6efdc 100%)', border: `${b}px solid #0b1c3f` }}
    >
      <div className="absolute" style={{ inset: b * 0.6, border: `${w * 0.0035}px solid #c8a24a` }} />
      <div className="absolute" style={{ inset: b * 1.1, border: `${Math.max(1, w * 0.0012)}px solid #c8a24a` }} />
    </div>
  );
}

function InveonMark({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M4 4L16 28L28 4H20L16 16L12 4H4Z" fill="#0050cb" />
      <path d="M20 4L16 16L12 4H7L16 22L25 4H20Z" fill="#f97316" />
    </svg>
  );
}

const PLACEHOLDER_PARTNERS = ['Music Partner', 'Co-Sponsor', 'Media Partner', 'Associate Partner'].map((role) => ({
  name: 'Your Logo Here',
  role,
  logoUrl: null,
}));

function TextBox({ field, values, w, editable }) {
  let text = fillTokens(field.text, values);
  if (field.uppercase) text = text.toUpperCase();
  return (
    <div
      className="w-full whitespace-pre-wrap break-words pointer-events-none"
      style={{
        fontFamily: `"${field.fontFamily || 'Montserrat'}"`,
        fontSize: ((field.fontSize || 15) * w) / 1000,
        fontWeight: field.bold ? 700 : 400,
        color: field.color || '#1f2937',
        textAlign: field.align || 'center',
        letterSpacing: ((field.letterSpacing || 0) * w) / 1000,
        lineHeight: 1.22,
      }}
    >
      {text || (editable ? <span className="text-slate-400 italic text-[10px]">{field.label} (empty)</span> : null)}
    </div>
  );
}

// The event's partners in a row centred inside the box — the same
// layout as the server's drawPartnersRow.
function PartnersRow({ partners, w }) {
  const px = (n) => (n * w) / 1000;
  return (
    <div className="w-full h-full flex items-stretch justify-center">
      {partners.map((p, i) => (
        <div
          key={`${p.name}-${i}`}
          className="flex flex-col items-center justify-center text-center min-w-0"
          style={{
            width: `min(${100 / partners.length}%, ${px(160)}px)`,
            flex: 'none',
            borderLeft: i ? '1px solid #d6c08a' : 'none',
          }}
        >
          {p.logoUrl && <img src={p.logoUrl} alt={p.name} style={{ height: '52%', maxWidth: '76%', objectFit: 'contain' }} />}
          <span className="font-bold text-slate-800 truncate max-w-full" style={{ fontFamily: 'Montserrat', fontSize: px(7.4) }}>
            {(p.role || p.name).toUpperCase()}
          </span>
          {p.role && (
            <span className="text-slate-500 truncate max-w-full" style={{ fontFamily: 'Montserrat', fontSize: px(7.2) }}>
              {p.name}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// One field of the designed footer (super admin → Certificate footer).
function FooterFieldView({ field, values, w, partners, editable }) {
  if (field.kind === 'partners') {
    if (partners.length) return <PartnersRow partners={partners} w={w} />;
    return editable ? (
      <div className="w-full h-full border-2 border-dashed border-slate-400/80 flex items-center justify-center text-slate-500 text-[10px]">
        Event partners
      </div>
    ) : null;
  }
  if (field.kind === 'platformMark') {
    return (
      <div className="w-full h-full flex items-center justify-center pointer-events-none">
        <svg viewBox="0 0 32 32" className="h-full max-w-full" aria-hidden="true">
          <path d="M4 4L16 28L28 4H20L16 16L12 4H4Z" fill="#0050cb" />
          <path d="M20 4L16 16L12 4H7L16 22L25 4H20Z" fill="#f97316" />
        </svg>
      </div>
    );
  }
  if (field.kind === 'image') {
    if (field.imageUrl) {
      return <img src={field.imageUrl} alt={field.label} className="w-full h-full object-contain pointer-events-none" draggable={false} />;
    }
    return editable ? (
      <div className="w-full h-full border-2 border-dashed border-slate-400/80 flex items-center justify-center text-slate-500 text-[10px] text-center px-1">
        {field.label}
      </div>
    ) : null;
  }
  if (field.onlyWithPartners && !partners.length && !editable) return null;
  return <TextBox field={field} values={values} w={w} editable={editable} />;
}

function DesignedFooter({ design, w, footerTop, partners, values, showPlaceholders, editable, selectedId, onStartDrag }) {
  const list = partners.length > 0 ? partners : showPlaceholders || editable ? PLACEHOLDER_PARTNERS : [];
  return (
    <>
      <div
        className="absolute rounded-lg bg-white/85 pointer-events-none"
        style={{ left: '7.5%', right: '7.5%', top: `${footerTop + 0.4}%`, bottom: '4.5%' }}
        data-testid="certificate-footer"
      />
      {design.fields.map((f) => {
        const selected = editable && f.id === selectedId;
        const outline = editable
          ? selected
            ? 'outline outline-2 outline-brand-500'
            : 'hover:outline hover:outline-1 hover:outline-brand-300'
          : '';
        return (
          <div
            key={f.id}
            className={`absolute ${outline} ${editable ? 'cursor-move' : 'pointer-events-none'}`}
            style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%` }}
            onPointerDown={(e) => onStartDrag?.(e, f, 'move')}
            data-footer-field={f.id}
          >
            <FooterFieldView field={f} values={values} w={w} partners={list} editable={editable} />
            {selected && (
              <span
                className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-brand-600 rounded-sm cursor-nwse-resize"
                onPointerDown={(e) => onStartDrag?.(e, f, 'resize')}
              />
            )}
          </div>
        );
      })}
      {showPlaceholders && !editable && (
        <span
          className="absolute inline-flex items-center gap-1 rounded-full bg-slate-800/80 text-white pointer-events-none"
          style={{
            right: '8%',
            top: `${footerTop + 1}%`,
            fontSize: Math.max(9, (7 * w) / 1000),
            padding: `${(1.5 * w) / 1000}px ${(5 * w) / 1000}px`,
          }}
        >
          <Lock style={{ width: Math.max(9, (7 * w) / 1000), height: Math.max(9, (7 * w) / 1000) }} /> Fixed footer
        </span>
      )}
    </>
  );
}

// The footer before it became designable — only used until branding with
// a design has loaded.
function FixedFooter({ w, footerTop, partners, showPlaceholders }) {
  // Labels and logo set by Inveon in the super admin portal.
  const footer = useBranding()?.certificateFooter ?? DEFAULT_CERTIFICATE_FOOTER;
  const list = partners.length > 0 ? partners : showPlaceholders ? PLACEHOLDER_PARTNERS : [];
  const px = (n) => (n * w) / 1000;
  const logo = (name, word) =>
    footer.logoUrl ? (
      <img src={footer.logoUrl} alt={name} style={{ height: px(22), maxWidth: px(90), objectFit: 'contain' }} />
    ) : (
      <span className="inline-flex items-center" style={{ gap: px(4) }}>
        <InveonMark size={px(18)} />
        <span className="leading-none text-left">
          <span className="block font-bold text-slate-900" style={{ fontFamily: 'Montserrat', fontSize: px(11), letterSpacing: px(0.6) }}>
            {name}
          </span>
          <span className="block font-bold text-[#0050cb]" style={{ fontFamily: 'Montserrat', fontSize: px(4), letterSpacing: px(1.6) }}>
            {word}
          </span>
        </span>
      </span>
    );
  return (
    <div
      className="absolute flex flex-col items-center justify-center rounded-lg bg-white/85 pointer-events-none"
      style={{ left: '7.5%', right: '7.5%', top: `${footerTop + 0.4}%`, bottom: '4.5%', gap: px(4) }}
      data-testid="certificate-footer"
    >
      {list.length > 0 && (
        <>
          <span className="font-bold text-[#0b1c3f]" style={{ fontFamily: 'Montserrat', fontSize: px(8), letterSpacing: px(2) }}>
            {footer.supportedByLabel}
          </span>
          <div className="flex items-stretch justify-center w-full" style={{ gap: px(2) }}>
            {list.map((p, i) => (
              <div
                key={`${p.name}-${i}`}
                className="flex flex-col items-center justify-center text-center"
                style={{ width: `${Math.min(84 / list.length, 16)}%`, borderLeft: i ? '1px solid #d6c08a' : 'none' }}
              >
                {p.logoUrl && <img src={p.logoUrl} alt={p.name} style={{ height: px(26), maxWidth: '76%', objectFit: 'contain' }} />}
                <span className="font-bold text-slate-800 truncate max-w-full" style={{ fontFamily: 'Montserrat', fontSize: px(7.2) }}>
                  {(p.role || p.name).toUpperCase()}
                </span>
                {p.role && (
                  <span className="text-slate-500 truncate max-w-full" style={{ fontFamily: 'Montserrat', fontSize: px(7) }}>
                    {p.name}
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      <div className="flex items-center justify-center" style={{ gap: px(40) }}>
        {[
          [footer.technologyPartnerLabel, footer.technologyPartnerName, footer.technologyPartnerTagline],
          [footer.bookingPartnerLabel, footer.bookingPartnerName, footer.bookingPartnerTagline],
        ].map(([label, name, word]) => (
          <div key={label} className="flex flex-col items-center" style={{ gap: px(2) }}>
            <span className="font-bold text-slate-700" style={{ fontFamily: 'Montserrat', fontSize: px(6.6), letterSpacing: px(1.6) }}>
              {label}
            </span>
            {logo(name, word)}
          </div>
        ))}
      </div>
      {showPlaceholders && (
        <span
          className="absolute top-1 right-2 inline-flex items-center gap-1 rounded-full bg-slate-800/80 text-white"
          style={{ fontSize: Math.max(9, px(7)), padding: `${px(1.5)}px ${px(5)}px` }}
        >
          <Lock style={{ width: Math.max(9, px(7)), height: Math.max(9, px(7)) }} /> Fixed footer
        </span>
      )}
    </div>
  );
}

export default function CertificateCanvas({
  design,
  values,
  organizerLogoUrl,
  partners = [],
  footerTop = 80,
  editable = false,
  selectedId = null,
  onSelect,
  onChangeField,
  // Super admin footer designer: edit the footer band instead of the body.
  footerDesign: footerDesignProp,
  footerEditable = false,
  selectedFooterId,
  onSelectFooter,
  onChangeFooterField,
}) {
  const ref = useRef(null);
  const brandedDesign = useBranding()?.certificateFooterDesign ?? null;
  const footerDesign = footerDesignProp || brandedDesign;
  const w = useWidth(ref);
  const drag = useRef(null);

  function startDrag(e, field, mode, target = 'body') {
    if (target === 'body' ? !editable : !footerEditable) return;
    e.preventDefault();
    e.stopPropagation();
    if (target === 'body') onSelect?.(field.id);
    else onSelectFooter?.(field.id);
    const rect = ref.current.getBoundingClientRect();
    drag.current = { id: field.id, mode, target, startX: e.clientX, startY: e.clientY, orig: { ...field }, rect };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    const d = drag.current;
    if (!d) return;
    const dx = ((e.clientX - d.startX) / d.rect.width) * 100;
    const dy = ((e.clientY - d.startY) / d.rect.height) * 100;
    const o = d.orig;
    const round = (n) => Math.round(n * 10) / 10;
    // Body fields stay above the footer band; footer fields inside it.
    const [minY, maxY, minW, minH] = d.target === 'footer' ? [footerTop, 100, 1, 0.5] : [0, footerTop, 3, 2];
    const change = d.target === 'footer' ? onChangeFooterField : onChangeField;
    if (d.mode === 'move') {
      change?.(d.id, {
        x: round(Math.min(100 - o.w, Math.max(0, o.x + dx))),
        y: round(Math.min(maxY - o.h, Math.max(minY, o.y + dy))),
      });
    } else {
      change?.(d.id, {
        w: round(Math.min(100 - o.x, Math.max(minW, o.w + dx))),
        h: round(Math.min(maxY - o.y, Math.max(minH, o.h + dy))),
      });
    }
  }

  function endDrag() {
    drag.current = null;
  }

  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden select-none shadow-lg"
      style={{ aspectRatio: '1754 / 1240', containerType: 'inline-size' }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onPointerDown={() => {
        if (editable) onSelect?.(null);
        if (footerEditable) onSelectFooter?.(null);
      }}
      data-testid="certificate-canvas"
    >
      {design.backgroundUrl ? (
        <img
          src={design.backgroundUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          draggable={false}
        />
      ) : (
        <BuiltInFrame w={w} />
      )}

      {design.fields.map((f) => {
        const selected = editable && f.id === selectedId;
        const box = { left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%` };
        const outline = editable
          ? selected
            ? 'outline outline-2 outline-brand-500'
            : 'hover:outline hover:outline-1 hover:outline-brand-300'
          : '';
        if (f.kind === 'image') {
          const src = f.imageUrl || (f.source === 'organizerLogo' ? organizerLogoUrl : null);
          return (
            <div
              key={f.id}
              className={`absolute ${outline} ${editable ? 'cursor-move' : ''}`}
              style={box}
              onPointerDown={(e) => startDrag(e, f, 'move')}
              data-field={f.id}
            >
              {src ? (
                <img src={src} alt={f.label} className="w-full h-full object-contain pointer-events-none" draggable={false} />
              ) : (
                editable && (
                  <div className="w-full h-full border-2 border-dashed border-slate-400/80 flex items-center justify-center text-slate-500 text-[10px] text-center px-1">
                    {f.label}
                  </div>
                )
              )}
              {selected && (
                <span
                  className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-brand-600 rounded-sm cursor-nwse-resize"
                  onPointerDown={(e) => startDrag(e, f, 'resize')}
                />
              )}
            </div>
          );
        }
        return (
          <div
            key={f.id}
            className={`absolute ${outline} ${editable ? 'cursor-move' : ''}`}
            style={box}
            onPointerDown={(e) => startDrag(e, f, 'move')}
            data-field={f.id}
          >
            <TextBox field={f} values={values} w={w} editable={editable} />
            {selected && (
              <span
                className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-brand-600 rounded-sm cursor-nwse-resize"
                onPointerDown={(e) => startDrag(e, f, 'resize')}
              />
            )}
          </div>
        );
      })}

      {footerDesign ? (
        <DesignedFooter
          design={footerDesign}
          w={w}
          footerTop={footerTop}
          partners={partners}
          values={values}
          showPlaceholders={editable}
          editable={footerEditable}
          selectedId={selectedFooterId ?? null}
          onStartDrag={(e, f, mode) => startDrag(e, f, mode, 'footer')}
        />
      ) : (
        <FixedFooter w={w} footerTop={footerTop} partners={partners} showPlaceholders={editable} />
      )}
    </div>
  );
}
