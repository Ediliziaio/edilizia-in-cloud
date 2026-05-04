import { motion, type MotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

type FadeUpProps = MotionProps & {
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  children: React.ReactNode;
};

export function FadeUp({ as = "div", className, children, transition, ...props }: FadeUpProps) {
  const Component = motion[as as "div"] ?? motion.div;

  return (
    <Component
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6, ease: "easeOut", ...transition }}
      className={cn(className)}
      {...props}
    >
      {children}
    </Component>
  );
}

export const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};
