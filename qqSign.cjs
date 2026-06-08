// QQ音乐 musics.fcg 请求签名（zzc，SHA1）。
// 收藏受版权保护的歌（如「美人鱼」）在未签名的 musicu.fcg 会回 80105；
// 改走 u6.y.qq.com/cgi-bin/musics.fcg?sign=<本函数> 即可成功（明文 JSON body 即可，无需加密）。
// 算法出处见 README/CLAUDE.md；测试向量 sign('123')==='zzcec1b555gzqzg7laztguyjl2bu20r6x1w50c55f60'。
const crypto = require('crypto')

function qqSign(text) {
  const sha1 = crypto.createHash('sha1').update(Buffer.from(text, 'utf-8')).digest('hex').toUpperCase()
  const part1 = [23, 14, 6, 36, 16, 40, 7, 19].map(i => sha1[i] ?? '').join('')
  const part2 = [16, 1, 32, 12, 19, 27, 8, 5].map(i => sha1[i]).join('')
  const scramble = [89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179]
  const part3 = scramble.map((s, i) => s ^ parseInt(sha1.slice(i * 2, i * 2 + 2), 16))
  const b64 = Buffer.from(part3).toString('base64').replace(/[\\/+=]/g, '')
  return `zzc${part1}${b64}${part2}`.toLowerCase()
}

module.exports = { qqSign }
