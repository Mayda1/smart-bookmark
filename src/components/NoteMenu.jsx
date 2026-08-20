import React, { useState, useRef, useEffect } from "react";

// 3-dot context menu for note cards
export default function NoteMenu({ onGoToPage, onDelete }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(prev => !prev)}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: '1.1rem',
          color: 'var(--text-secondary)',
          padding: '2px 6px',
          borderRadius: '6px',
          lineHeight: 1,
          transition: 'background 0.15s ease'
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--border-subtle)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        title="אפשרויות"
      >
        ⋮
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 'auto',
          marginTop: '4px',
          background: '#ffffff',
          border: '1px solid var(--border-subtle)',
          borderRadius: '10px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          zIndex: 200,
          minWidth: '160px',
          overflow: 'hidden',
          animation: 'fadeIn 0.15s ease-out'
        }}>
          {onGoToPage && (
            <button
              onClick={() => { setOpen(false); onGoToPage(); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                width: '100%',
                padding: '0.65rem 1rem',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                color: 'var(--primary-slate)',
                textAlign: 'start',
                transition: 'background 0.12s ease'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f5f3ef'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              📖 מעבר לעמוד
            </button>
          )}

          {onDelete && (
            <button
              onClick={() => { setOpen(false); onDelete(); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                width: '100%',
                padding: '0.65rem 1rem',
                background: 'transparent',
                border: 'none',
                borderTop: onGoToPage ? '1px solid var(--border-subtle)' : 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                color: 'var(--error, #c0392b)',
                textAlign: 'start',
                transition: 'background 0.12s ease'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#fdf2f2'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              🗑️ מחיקה
            </button>
          )}
        </div>
      )}
    </div>
  );
}
