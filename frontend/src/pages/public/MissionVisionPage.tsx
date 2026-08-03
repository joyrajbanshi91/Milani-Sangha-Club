import { Eye, Target, type LucideIcon } from 'lucide-react'

import { PageHero } from '@/components/layout/PageHero'
import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { missionVision } from '@/content/site'
import { cn } from '@/lib/cn'
import { hueByIndex, HUES } from '@/lib/hues'

export function MissionVisionPage() {
  return (
    <>
      <PageHero
        eyebrow={missionVision.eyebrow}
        title={missionVision.title}
        lead={missionVision.lead}
      />

      <Section>
        <Reveal mode="stagger" className="grid gap-6 lg:grid-cols-2">
          <Statement
            icon={Target}
            title={missionVision.mission.title}
            body={missionVision.mission.body}
            tone="emerald"
          />
          <Statement
            icon={Eye}
            title={missionVision.vision.title}
            body={missionVision.vision.body}
            tone="violet"
          />
        </Reveal>
      </Section>

      <Section tone="auroraSoft">
        <Reveal>
          <SectionHeading
            eyebrow="How we get there"
            title="Our objectives"
            lead="The committee reports against these at the annual general body meeting."
          />
        </Reveal>

        <Reveal mode="stagger" as="ol" className="mt-10 grid gap-4 sm:grid-cols-2">
          {missionVision.objectives.map((objective, index) => {
            const hue = hueByIndex(index)
            return (
              <li
                key={objective}
                className={cn(
                  'group flex gap-4 rounded-card border bg-white/85 p-5 shadow-soft backdrop-blur-sm',
                  'transition-all duration-300 hover:-translate-y-1 hover:shadow-lift',
                  hue.border
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-lg transition-transform duration-300 group-hover:scale-110',
                    hue.tile
                  )}
                  aria-hidden="true"
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <p className="self-center text-sm/relaxed text-ink-700">{objective}</p>
              </li>
            )
          })}
        </Reveal>
      </Section>
    </>
  )
}

function Statement({
  icon: Icon,
  title,
  body,
  tone,
}: {
  icon: LucideIcon
  title: string
  body: string
  tone: 'emerald' | 'violet'
}) {
  const hue = HUES[tone]

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-card border bg-white p-8 shadow-soft transition-shadow duration-300 hover:shadow-lift sm:p-10',
        hue.border
      )}
    >
      <span
        className={cn(
          'pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-30 blur-3xl transition-opacity duration-500 group-hover:opacity-50',
          hue.bar
        )}
        aria-hidden="true"
      />

      <div className="relative">
        <span
          className={cn(
            'inline-flex h-14 w-14 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110',
            hue.tile
          )}
        >
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>

        <h2 className="mt-6 font-display text-2xl text-ink-900 sm:text-3xl">{title}</h2>
        <p className="mt-4 text-lg/relaxed text-ink-600">{body}</p>
      </div>
    </div>
  )
}
