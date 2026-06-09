import { FaGithub, FaLinkedin, FaInstagram } from "react-icons/fa";
import { MdEmail } from "react-icons/md";

const links = [
  { href: "https://github.com/Mic-Guo", icon: FaGithub, label: "GitHub" },
  {
    href: "https://www.linkedin.com/in/Micguo/",
    icon: FaLinkedin,
    label: "LinkedIn",
  },
  {
    href: "https://www.instagram.com/michael.goop/",
    icon: FaInstagram,
    label: "Instagram",
  },
  { href: "mailto:mickeyg@umich.edu", icon: MdEmail, label: "Email" },
];

export default function SocialLinks({ className = "" }) {
  return (
    <div className={`flex items-center gap-5 ${className}`}>
      {links.map(({ href, icon: Icon, label }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className="text-gray-500 hover:text-blue-400 transition-colors duration-200 text-xl"
        >
          <Icon />
        </a>
      ))}
    </div>
  );
}
