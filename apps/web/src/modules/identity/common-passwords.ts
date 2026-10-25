import { COMMON_PASSWORDS_DATA, COMMON_PASSWORDS_SOURCE } from './common-passwords.data';
import { blocklistKey } from './password-normalize';

/**
 * Local blocklist of common and leaked passwords (security.md SEC-P3, ADR-0003 section 3).
 * No external API. Two parts:
 *  1. `common-passwords.data.ts` — about 100 000 entries generated from SecLists (MIT) by
 *     `scripts/build-common-passwords.ts`; source, licence, commit and checksums are in that
 *     file's header and in `COMMON_PASSWORDS_SOURCE`.
 *  2. The hand-written list below: Iran-specific and product-specific patterns the public
 *     corpora do not cover.
 * Entries and candidates are compared as `blocklistKey()` = normalizePassword() + lower case.
 * Only entries of 8+ characters are kept: shorter ones are refused by the length rule anyway.
 */
const LOCAL_LIST = `
12345678 123456789 1234567890 12345678910 0123456789 987654321 9876543210 87654321
11111111 111111111 1111111111 00000000 000000000 0000000000 22222222 33333333 44444444
55555555 66666666 77777777 88888888 99999999 12341234 11223344 12121212 13131313 69696969
123123123 123321123 112233445 1122334455 12344321 147258369 159753258 741852963 963852741
password password1 password12 password123 password1234 passw0rd p@ssw0rd p@ssword
pass1234 pass12345 password! qwertyui qwertyuiop qwerty123 qwerty1234 qwerty12 1qaz2wsx
1q2w3e4r 1q2w3e4r5t 1q2w3e4r5t6y q1w2e3r4 q1w2e3r4t5 zaq12wsx zaq1zaq1 asdfghjk
asdfghjkl asdf1234 zxcvbnm1 zxcvbnm123 abcd1234 abcdefgh abc12345 abc123456 a1234567
a12345678 aa123456 aaaaaaaa 1234qwer qwer1234 12qwaszx iloveyou iloveyou1 sunshine
princess football baseball superman batman123 starwars whatever trustno1 sunshine1
welcome1 welcome123 letmein1 letmein123 monkey123 dragon123 master123 shadow123 michael1
jennifer jordan23 charlie1 computer internet samsung1 samsung123 google123 facebook
instagram telegram whatsapp freelance freelancer upwork123 fiverr123 linkedin
admin123 admin1234 administrator changeme changeme1 default1 secret123 test1234 testtest
iloveu123 lovelove 12345qwert qwert12345 1234abcd abcd12345 1a2b3c4d mypassword
iran1234 iran12345 iran1400 iran1401 iran1402 iran1403 iran1404 iran1405 tehran123
tehran1234 esteghlal perspolis persepolis perspolis1 ali12345 ali123456 mohammad
mohammad1 mohammad123 mohamad123 hossein123 reza12345 reza123456 zahra123 fatemeh123
maryam123 sara12345 amir12345 amir123456 mehdi123 hamid123 farhad123 iran@123
bahman123 esfand123 farvardin ordibehesht khordad1 tir12345 mordad123 shahrivar
mehr1234 aban1234 azar1234 dey12345 1234567a 123456aa 123456ab 12345678a 123456789a
upworkcoach upworkcoach1 upworkcoach123
`;

function splitList(text: string, separator: RegExp): string[] {
  return text
    .split(separator)
    .filter((entry) => entry.length > 0)
    .map(blocklistKey);
}

let blocklist: ReadonlySet<string> | undefined;

/** The whole blocklist (built once, on first use: about 100k short strings). */
export function getCommonPasswords(): ReadonlySet<string> {
  blocklist ??= new Set([
    ...splitList(COMMON_PASSWORDS_DATA, /\n/),
    ...splitList(LOCAL_LIST, /\s+/),
  ]);
  return blocklist;
}

/** SEC-P3: true when the (raw or normalised) password is on the blocklist. */
export function isCommonPassword(password: string): boolean {
  return getCommonPasswords().has(blocklistKey(password));
}

export { COMMON_PASSWORDS_SOURCE };
