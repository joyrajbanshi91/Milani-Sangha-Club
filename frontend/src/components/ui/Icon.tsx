import {
  Award,
  Calendar,
  FileText,
  HandHeart,
  Heart,
  Landmark,
  Sparkles,
  Target,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react'

/**
 * Icons that content can reference by name.
 *
 * The content file holds plain strings ('trophy'), not component imports, so
 * that editing copy never means editing code. Add a new entry here to make a
 * new icon available.
 */
const ICONS: Record<string, LucideIcon> = {
  trophy: Trophy,
  sparkles: Sparkles,
  heart: Heart,
  handHeart: HandHeart,
  users: Users,
  award: Award,
  calendar: Calendar,
  document: FileText,
  target: Target,
  landmark: Landmark,
}

/** Falls back to a neutral icon rather than crashing on an unknown name. */
export function iconByName(name: string): LucideIcon {
  return ICONS[name] ?? Sparkles
}
