import {
  ArrowLeftRight,
  Banknote,
  Briefcase,
  Bus,
  Car,
  Circle,
  CircleEllipsis,
  CirclePlus,
  CreditCard,
  Film,
  Gift,
  GraduationCap,
  Heart,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  Percent,
  PiggyBank,
  Plane,
  Receipt,
  Repeat,
  Scale,
  ShoppingBag,
  Smartphone,
  Tag,
  Target,
  TrendingUp,
  User,
  Users,
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
  car: Car,
  'circle-ellipsis': CircleEllipsis,
  'circle-plus': CirclePlus,
  'credit-card': CreditCard,
  film: Film,
  gift: Gift,
  heart: Heart,
  'graduation-cap': GraduationCap,
  'heart-pulse': HeartPulse,
  home: House,
  landmark: Landmark,
  laptop: Laptop,
  percent: Percent,
  'piggy-bank': PiggyBank,
  plane: Plane,
  receipt: Receipt,
  repeat: Repeat,
  scale: Scale,
  'shopping-bag': ShoppingBag,
  smartphone: Smartphone,
  tag: Tag,
  target: Target,
  'trending-up': TrendingUp,
  user: User,
  users: Users,
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
