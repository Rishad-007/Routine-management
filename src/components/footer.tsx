import { GraduationCap, Mail, Phone, LifeBuoy } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-12 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
        <div className="grid gap-8 md:grid-cols-3">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1e3a5f] text-white">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div className="leading-tight">
                <p className="text-sm font-bold text-[#1e3a5f]">
                  Cantonment Public School
                </p>
                <p className="text-xs text-slate-500">&amp; College, Rangpur</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              Daily class routine management — built and maintained by the ICT
              Department.
            </p>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1e3a5f]">
              Admin Contact
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li className="font-medium text-[#1e3a5f]">MD. Rishad Nur</li>
              <li className="text-slate-500">
                Assistant Teacher (ICT)
              </li>
              <li>
                <a
                  href="mailto:rishad.nur007@gmail.com"
                  className="inline-flex items-center gap-1.5 hover:text-[#0d9488]"
                >
                  <Mail className="h-4 w-4" />
                  rishad.nur007@gmail.com
                </a>
              </li>
              <li>
                <a
                  href="tel:+8801770683027"
                  className="inline-flex items-center gap-1.5 hover:text-[#0d9488]"
                >
                  <Phone className="h-4 w-4" />
                  01770 683027
                </a>
              </li>
            </ul>
          </div>

          {/* Help */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1e3a5f]">
              Need Help?
            </h3>
            <p className="mt-3 inline-flex items-start gap-1.5 text-sm text-slate-600">
              <LifeBuoy className="mt-0.5 h-4 w-4 text-[#0d9488]" />
              For any help, please contact the ICT Department.
            </p>
          </div>
        </div>

        <div className="mt-8 border-t border-slate-100 pt-5 text-center text-sm text-slate-500">
          This site was built by{" "}
          <span className="font-medium text-[#1e3a5f]">Rishad Nur</span> &amp;{" "}
          <span className="font-medium text-[#1e3a5f]">
            ICT Department (School)
          </span>
          . For any help, contact the ICT Department.
        </div>
      </div>
    </footer>
  );
}
