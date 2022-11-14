/**
 * Tests if passed input is a string in format YYYY-MM-DD
 * @param {any} date 
 */
function isValidDate(date) {
    const dateRegex = /^\d{4}\-(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])$/
    if (!date) return false
    if (typeof date != 'string') return false
    if (date.length != 10) return false
    if (!dateRegex.test(date)) return false
    return true
}

module.exports = {
    isValidDate
}