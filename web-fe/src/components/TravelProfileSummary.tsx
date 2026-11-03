import { useMemo } from 'react'
import type { Tag } from '@/types'
import { buildTravelProfileSummary, getInterestLevel, preferenceMeta } from '@/data/preferencePresentation'
import styles from './TravelProfileSummary.module.css'

interface TravelProfileSummaryProps {
  preferences: Tag[]
}

export function TravelProfileSummary({ preferences }: TravelProfileSummaryProps) {
  const highlights = useMemo(() => preferences
    .slice()
    .sort((first, second) => second.weight - first.weight)
    .slice(0, 6)
    .map((preference) => ({
      ...preference,
      label: preferenceMeta[preference.tag]?.label || preference.tag,
      icon: preferenceMeta[preference.tag]?.icon || '✦',
      level: getInterestLevel(preference.weight),
    })), [preferences])

  const summary = buildTravelProfileSummary(highlights.slice(0, 3).map(({ label }) => label))

  return (
    <div className={styles.profileSummary}>
      <div className={styles.intro}>
        <span className={styles.spark} aria-hidden='true'>✦</span>
        <p>{summary}</p>
      </div>

      {highlights.length ? (
        <div className={styles.highlights}>
          {highlights.map(({ tag, label, icon, level }) => (
            <div className={styles.highlight} key={tag}>
              <span className={styles.icon} aria-hidden='true'>{icon}</span>
              <div className={styles.text}>
                <strong>{label}</strong>
                <span>Trong hồ sơ gợi ý</span>
              </div>
              <span className={`${styles.level} ${level.tone === 'high' ? styles.levelHigh : level.tone === 'medium' ? styles.levelMedium : styles.levelLow}`}>
                {level.label}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>Hãy chọn một vài sở thích trong Cài đặt để Vivu bắt đầu cá nhân hóa gợi ý.</p>
      )}
    </div>
  )
}
