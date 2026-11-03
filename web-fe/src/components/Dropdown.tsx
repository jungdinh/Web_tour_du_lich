import { useState, useRef, useEffect } from 'react';
import styles from './Dropdown.module.css';

interface DropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  className?: string;
  disabled?: boolean;
  menuVariant?: 'list' | 'grid' | 'auto';
  columns?: 2 | 3;
}

export function Dropdown({
  value,
  onChange,
  options,
  className,
  disabled,
  menuVariant = 'auto',
  columns = 2,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isGrid = menuVariant === 'grid' || (menuVariant === 'auto' && options.length >= 8);
  const selectedOption = options.find(opt => opt.value === value) || options[0];

  const gridClass = isGrid ? (columns === 3 ? styles.gridMenu3 : styles.gridMenu2) : '';

  return (
    <div className={`${styles.dropdownContainer} ${className || ''} ${disabled ? styles.disabled : ''} ${isOpen ? styles.open : ''}`} ref={containerRef}>
      <button 
        type="button" 
        className={styles.dropdownTrigger} 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span className={styles.triggerLabel}>{selectedOption?.label}</span>
        <svg className={styles.chevron} viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      
      {isOpen && (
        <div className={`${styles.dropdownMenu} ${gridClass}`}>
          {options.map((opt, index) => {
            const isFirstOptionFull = isGrid && index === 0 && (opt.value === '' || opt.label.includes('Tất cả'));
            return (
              <button
                key={opt.value}
                type="button"
                className={`${styles.dropdownItem} ${opt.value === value ? styles.active : ''} ${opt.disabled ? styles.itemDisabled : ''} ${isFirstOptionFull ? styles.fullWidthItem : ''}`}
                disabled={opt.disabled}
                onClick={() => {
                  if (!opt.disabled) {
                    onChange(opt.value);
                    setIsOpen(false);
                  }
                }}
              >
                <span className={styles.itemLabel}>{opt.label}</span>
                {opt.value === value && (
                  <svg className={styles.checkIcon} viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
