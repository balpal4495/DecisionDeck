"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

interface NavLinkProps {
  href: string
  className?: string
  activeClassName?: string
  children: React.ReactNode
}

export function NavLink({ href, className, activeClassName, children }: NavLinkProps) {
  const pathname = usePathname()
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href)
  const combined = [className, isActive ? activeClassName : ""].filter(Boolean).join(" ")
  return (
    <Link href={href} className={combined}>
      {children}
    </Link>
  )
}
