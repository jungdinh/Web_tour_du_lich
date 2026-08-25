const allowedTags = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'H3', 'BLOCKQUOTE', 'A', 'IMG'])

export function sanitizeRichText(value: string) {
  if (!value) return ''
  const documentParser = new DOMParser()
  const document = documentParser.parseFromString(value, 'text/html')

  for (const element of Array.from(document.body.querySelectorAll('*'))) {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes))
      continue
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      const allowed = (element.tagName === 'IMG' && name === 'src') || (element.tagName === 'A' && name === 'href') || (element.tagName === 'IMG' && name === 'alt')
      if (!allowed) element.removeAttribute(attribute.name)
    }
    if (element.tagName === 'IMG' && !/^https?:\/\//i.test(element.getAttribute('src') || '')) element.remove()
    if (element.tagName === 'A' && !/^https?:\/\//i.test(element.getAttribute('href') || '')) element.remove()
  }
  return document.body.innerHTML
}
