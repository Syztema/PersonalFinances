import {
  ArrowLeftRight,
  Banknote,
  Briefcase,
  Bus,
  Circle,
  CircleEllipsis,
  CirclePlus,
  CreditCard,
  Film,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  Percent,
  PiggyBank,
  Receipt,
  Repeat,
  Scale,
  ShoppingBag,
  Smartphone,
  Tag,
  TrendingUp,
  Utensils,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  'arrow-left-right': ArrowLeftRight,
  banknote: Banknote,
  briefcase: Briefcase,
  bus: Bus,
  'circle-ellipsis': CircleEllipsis,
  'circle-plus': CirclePlus,
  'credit-card': CreditCard,
  film: Film,
  gift: Gift,
  'graduation-cap': GraduationCap,
  'heart-pulse': HeartPulse,
  home: House,
  landmark: Landmark,
  laptop: Laptop,
  percent: Percent,
  'piggy-bank': PiggyBank,
  receipt: Receipt,
  repeat: Repeat,
  scale: Scale,
  'shopping-bag': ShoppingBag,
  smartphone: Smartphone,
  tag: Tag,
  'trending-up': TrendingUp,
  utensils: Utensils,
  wallet: Wallet,
  zap: Zap,
};

export const ICON_CHOICES = Object.keys(ICONS);

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Component = ICONS[name] ?? Circle;
  return <Component size={size} className={className} aria-hidden />;
}
