import Link from "next/link";

export function Brand() {
  return <Link href="/" className="brand" aria-label="Zenvo home">zenvo<span aria-hidden="true">.</span></Link>;
}
