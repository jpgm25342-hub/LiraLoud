/* LiraLoud
 * Copyright 2026 José Pablo González Macías
 * Licensed under the Apache License, Version 2.0
 */

// 6. ATAJOS
// ==========================================

// Flag global para desactivar atajos cuando se está editando texto en el PDF
window.textoEditandoActivo = false;

const atajosIcons = {
    'play_pause': `<svg class="svg-icon" viewBox="-0.5 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg" transform="rotate(180)"><path d="M20.0195 21.3199C22.5695 20.4399 23.0195 15.7199 23.0195 12.4099C23.0195 9.09992 22.5895 4.41001 20.0195 3.51001C17.3095 2.58001 9.01953 8.65991 9.01953 12.4099C9.01953 16.1599 17.3095 22.2499 20.0195 21.3199Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M1 18.92C1 20.3008 2.11929 21.42 3.5 21.42C4.88071 21.42 6 20.3008 6 18.92L6 5.92004C6 4.53933 4.88071 3.42004 3.5 3.42004C2.11929 3.42004 1 4.53933 1 5.92004L1 18.92Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    'speed_up': `<svg class="svg-icon" viewBox="0 0 512 512" fill="currentColor"><path d="M472.345,355.081c-8.729-64.995-64.55-115.272-131.883-115.272h-114.33c1.894-4.349,3.618-8.803,5.121-13.363 c1.979-5.967,2.973-12.199,2.973-18.526c0-4.793-0.571-9.596-1.693-14.347c13.712-9.078,27.72-20.653,40.935-33.857 c20.155-20.166,36.396-42.057,45.717-61.641c13.955-29.318,8.221-44.13,0.963-51.399c-7.269-7.258-22.092-13.003-51.409,0.952 c-3.036,1.439-6.137,3.068-9.268,4.846c-0.159-24.356-7.332-40.067-20.928-45.008c-28.969-10.485-63.482,37.422-82.611,90.186 c-5.269,14.527-9.332,29.307-11.935,43.242c-59.154,7.142-107.506,45.527-126.138,101.877c-1.979,5.967-2.973,12.199-2.973,18.526 c0,26.916,17.521,51.991,42.353,62.73c-6.147,15.5-9.258,31.889-9.258,48.87c0,20.187,4.518,39.845,13.162,57.758H37.666 C16.897,430.656,0,447.552,0,468.321c0,20.758,16.897,37.655,37.666,37.655l302.797,0.011c35.539,0,68.952-13.839,94.111-38.978 c6.888-6.898,12.919-14.41,18.05-22.42c4.317,1.312,8.824,2.021,13.384,2.021c25.361,0,45.992-20.631,45.992-45.982 C512,377.416,494.712,358.181,472.345,355.081z M175.823,104.868c20.642-56.932,48.246-80.135,55.493-77.511 c3.365,1.217,8.993,12.495,6.263,39.496c-10.252,7.65-20.568,16.6-30.471,26.504c-15.087,15.077-27.89,31.011-37.391,46.447 c-1.016-0.063-3.618-0.127-3.915-0.127C168.194,128.388,171.58,116.559,175.823,104.868z M438.552,426.878 c-5.036,9.12-11.384,17.595-18.949,25.17c-21.15,21.139-49.251,32.778-79.14,32.778H224.164v-0.011 c-9.099,0-16.505-7.396-16.505-16.495c0-9.11,7.406-16.505,16.505-16.505h47.886c5.84,0,10.58-4.74,10.58-10.58v-17.923 c0-29.529,24.017-53.547,53.547-53.547h13.987c5.84,0,10.58-4.74,10.58-10.58c0-5.851-4.74-10.58-10.58-10.58h-13.987 c-41.2,0-74.707,33.508-74.707,74.707v7.343h-37.306c-20.769,0-37.666,16.897-37.666,37.666c0,5.914,1.375,11.511,3.82,16.495 H37.666c-9.099,0-16.505-7.396-16.505-16.495c0-9.11,7.406-16.505,16.505-16.505h41.718c2.031,0,4.084-0.582,5.904-1.809 c4.846-3.259,6.126-9.84,2.867-14.685c-12.442-18.463-19.013-40.057-19.013-62.424c0-17.754,4.031-34.735,11.987-50.457 c2.645-5.206,0.55-11.575-4.655-14.22c-0.815-0.402-1.651-0.688-2.497-0.878c-10.633-2.359-20.113-8.591-26.937-16.876 c-6.824-8.284-10.993-18.621-10.993-29.17c0-4.063,0.635-8.073,1.904-11.892c8.76-26.482,25.202-48.786,47.548-64.497 c22.42-15.743,49.611-24.07,78.654-24.07c0.751,0,6.941,0.275,9.3,0.698c4.55,0.804,8.93-1.428,11.067-5.237l0.011,0.011 c8.697-15.426,22.028-32.471,37.539-47.992c10.284-10.284,20.959-19.404,31.413-26.906c0.222-0.148,0.434-0.296,0.635-0.455 c8.147-5.809,16.156-10.623,23.721-14.22c16.124-7.671,25.192-7.258,27.339-5.1c2.158,2.158,2.582,11.215-5.1,27.35 c-8.316,17.457-23.076,37.264-41.57,55.758c-13.754,13.754-28.345,25.541-42.3,34.164l0.095,0.159 c-4.222,1.608-6.814,5.629-6.814,9.893c0,1.248,0.222,2.518,0.688,3.756c1.915,5.036,2.888,10.146,2.888,15.204 c0,4.063-0.645,8.073-1.904,11.892c-2.941,8.909-6.771,17.383-11.384,25.213c-2.963,5.036-1.28,11.522,3.756,14.484 c1.682,0.995,3.534,1.46,5.354,1.46h131.576c61.715,0,111.918,50.214,111.918,111.929 C452.38,399.084,438.711,426.54,438.552,426.878z M466.008,425.45c-1.047,0-2.095-0.074-3.132-0.201 c6.475-15.13,10.094-31.445,10.601-48.31c10.051,3.185,17.362,12.591,17.362,23.689C490.839,414.32,479.698,425.45,466.008,425.45 z"/><circle cx="102.311" cy="223.497" r="12.823"/><path d="M340.457,276.841c-5.842,0-10.58,4.738-10.58,10.58c0,5.842,4.738,10.58,10.58,10.58 c41.297,0,74.895,33.598,74.895,74.894c0,5.842,4.738,10.58,10.58,10.58s10.58-4.738,10.58-10.58 C436.512,319.931,393.423,276.841,340.457,276.841z"/></svg>`,
    'add_abbr': `<svg class="svg-icon" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11 3.99995C12.8839 2.91716 14.9355 2.15669 17.07 1.74995C17.551 1.63467 18.0523 1.63283 18.5341 1.74458C19.016 1.85632 19.4652 2.07852 19.8464 2.39375C20.2276 2.70897 20.5303 3.10856 20.7305 3.56086C20.9307 4.01316 21.0229 4.50585 21 4.99995V13.9999C20.9699 15.117 20.5666 16.1917 19.8542 17.0527C19.1419 17.9136 18.1617 18.5112 17.07 18.7499C14.9355 19.1567 12.8839 19.9172 11 20.9999" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.9995 3.99995C9.1156 2.91716 7.06409 2.15669 4.92957 1.74995C4.44856 1.63467 3.94731 1.63283 3.46546 1.74458C2.98362 1.85632 2.53439 2.07852 2.15321 2.39375C1.77203 2.70897 1.46933 3.10856 1.26911 3.56086C1.0689 4.01316 0.976598 4.50585 0.999521 4.99995V13.9999C1.0296 15.117 1.433 16.1917 2.14533 17.0527C2.85767 17.9136 3.83793 18.5112 4.92957 18.7499C7.06409 19.1567 9.1156 19.9172 10.9995 20.9999" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 21V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    'next_page': `<svg class="svg-icon" viewBox="-0.5 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.47 4.13998C12.74 4.35998 12.28 5.96 12.09 7.91C6.77997 7.91 2 13.4802 2 20.0802C4.19 14.0802 8.99995 12.45 12.14 12.45C12.34 14.21 12.79 15.6202 13.47 15.8202C15.57 16.4302 22 12.4401 22 9.98006C22 7.52006 15.57 3.52998 13.47 4.13998Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    'next_sentence': `<svg class="svg-icon" viewBox="-0.5 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg" transform="rotate(0)matrix(-1, 0, 0, 1, 0, 0)"><path d="M20.0195 21.3199C22.5695 20.4399 23.0195 15.7199 23.0195 12.4099C23.0195 9.09992 22.5895 4.41001 20.0195 3.51001C17.3095 2.58001 9.01953 8.65991 9.01953 12.4099C9.01953 16.1599 17.3095 22.2499 20.0195 21.3199Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.0195 3.51001C9.30953 2.58001 1.01953 8.65991 1.01953 12.4099C1.01953 16.1599 9.32953 22.2499 12.0195 21.3199" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    'open_pdf': `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M10.58 21H6C4.93913 21 3.92172 20.5785 3.17157 19.8284C2.42142 19.0782 2 18.0609 2 17V7C2 5.93913 2.42142 4.92165 3.17157 4.17151C3.92172 3.42136 4.93913 3 6 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/> <path d="M6 3H8C8.69805 3.00421 9.38284 3.19101 9.98633 3.54187C10.5898 3.89273 11.091 4.39545 11.44 5C11.797 5.60635 12.3055 6.10947 12.9156 6.46008C13.5256 6.8107 14.2164 6.99678 14.92 7H18C19.0609 7 20.0783 7.42136 20.8284 8.17151C21.5786 8.92165 22 9.93913 22 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/> <path d="M14 18H22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
    'prev_sentence': `<svg class="svg-icon" viewBox="-0.5 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M20.0195 21.3199C22.5695 20.4399 23.0195 15.7199 23.0195 12.4099C23.0195 9.09992 22.5895 4.41001 20.0195 3.51001C17.3095 2.58001 9.01953 8.65991 9.01953 12.4099C9.01953 16.1599 17.3095 22.2499 20.0195 21.3199Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/> <path d="M12.0195 3.51001C9.30953 2.58001 1.01953 8.65991 1.01953 12.4099C1.01953 16.1599 9.32953 22.2499 12.0195 21.3199" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
    'toggle_dicc': `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M7 22C5.93913 22 4.92178 21.5785 4.17163 20.8284C3.42149 20.0782 3 19.0609 3 18C3 16.9391 3.42149 15.9217 4.17163 15.1715C4.92178 14.4214 5.93913 14 7 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/> <path d="M7 2C5.93913 2 4.92178 2.42136 4.17163 3.17151C3.42149 3.92165 3 4.93913 3 6V18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/> <path d="M7 2H19C19.5304 2 20.0392 2.21074 20.4142 2.58582C20.7893 2.96089 21 3.46957 21 4V16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/> <path d="M7 14H19C19.5304 14 20.0392 14.2107 20.4142 14.5858C20.7893 14.9609 21 15.4696 21 16V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0392 21.7893 19.5304 22 19 22H7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
    'speed_down': `<svg class="svg-icon" viewBox="0 0 511.999 511.999" fill="currentColor" transform="rotate(270)">
<g><g><path d="M464.369,143.408c0-12.906-5.032-25.034-14.158-34.172c-9.126-9.126-21.266-14.146-34.172-14.146 s-25.046,5.021-34.172,14.146l-17.836,17.844c-14.795-13.032-31.953-23.432-50.736-30.469V57.293 C313.296,25.701,287.594,0,256.003,0c-31.592,0-57.294,25.701-57.294,57.293v39.327c-0.001,0-0.002,0.001-0.003,0.001 c-18.783,7.038-35.944,17.438-50.74,30.46l-17.835-17.844c-9.126-9.126-21.266-14.146-34.172-14.146s-25.046,5.021-34.172,14.146 c-9.126,9.137-14.158,21.266-14.158,34.172c0,12.917,5.032,25.046,14.158,34.183l34.844,34.844 c-2.841,12.071-4.348,24.64-4.348,37.569v51.495c0,25.533,5.867,49.709,16.338,71.265l-18.703,18.703 c-10.621,10.621-16.465,24.733-16.465,39.749c0,15.016,5.844,29.139,16.465,39.749c10.61,10.621,24.733,16.465,39.749,16.465 s29.128-5.844,39.749-16.465l19.932-19.932c8.859,3.966,18.135,7.166,27.748,9.52h0.001l9.584,24.521 c9.157,23.427,22.304,26.926,29.326,26.926c7.021,0,20.168-3.5,29.325-26.927l9.584-24.521c9.611-2.354,18.887-5.554,27.757-9.519 l0.001-0.001l19.943,19.934c10.61,10.621,24.733,16.465,39.749,16.465c15.016,0,29.128-5.844,39.749-16.465 c21.915-21.915,21.915-57.571,0-79.498l-18.718-18.709c0.001-0.002,0.002-0.003,0.003-0.006 c10.471-21.556,16.338-45.732,16.338-71.254v-51.495c0-12.929-1.507-25.51-4.36-37.581l34.832-34.832 C459.336,168.454,464.369,156.325,464.369,143.408z M396.547,250.004v14.145h-53.791l-32.258-55.877l-0.003-0.005l37.294-64.604 C377.635,169.451,396.547,207.565,396.547,250.004z M322.673,275.757l-33.337,57.733h-66.662l-33.337-57.733l33.337-57.745h66.662 L322.673,275.757z M221.902,64.572c1.869,1.51,4.245,2.418,6.834,2.418c6.014,0,10.89-4.876,10.89-10.892 c0-6.014-4.876-10.89-10.89-10.89c-1.827,0-3.547,0.456-5.059,1.251c4.538-13.507,17.31-23.268,32.327-23.268 c15.015,0,27.786,9.759,32.327,23.264c-1.511-0.793-3.227-1.248-5.052-1.248c-6.014,0-10.89,4.876-10.89,10.89 c0,6.015,4.876,10.892,10.89,10.892c2.587,0,4.959-0.907,6.829-2.413V89.85c-0.001,0-0.002-0.001-0.005-0.001 c-11.004-2.342-22.402-3.571-34.09-3.571c-11.699,0-23.107,1.229-34.11,3.583V64.572z M184.653,128.982 c20.931-12.406,45.327-19.514,71.359-19.514c26.688,0,51.661,7.477,72.936,20.448l-37.468,64.905h-68.813l-38.014-65.838V128.982z M165.656,142.462l36.935,63.969l-33.324,57.719h-53.791v-14.145C115.476,206.896,134.989,168.25,165.656,142.462z M104.634,187.633l-26.449-26.449c-4.742-4.742-7.363-11.062-7.363-17.776c0-6.714,2.621-13.022,7.363-17.764 c4.742-4.754,11.062-7.363,17.776-7.363c6.714,0,13.022,2.609,17.776,7.363l17.938,17.938 C120.473,156.65,111.301,171.492,104.634,187.633z M153.01,454.569c-6.227,6.238-14.529,9.671-23.341,9.671 c-8.824,0-17.115-3.432-23.353-9.671c-6.238-6.238-9.671-14.529-9.671-23.353c0-8.812,3.432-17.115,9.671-23.341l14.34-14.348 c0.001,0.001,0.002,0.003,0.003,0.005c12.511,18.344,28.664,34.032,47.39,45.999c0.001,0.001,0.003,0.001,0.005,0.002 L153.01,454.569z M167.101,410.254c-0.001-0.001-0.001-0.001-0.002-0.002c-31.493-25.788-51.623-64.969-51.623-108.753V287.34 h53.779v0.001l34.402,59.587L167.101,410.254z M263.732,476.632c-3.283,8.402-6.522,11.471-7.724,12.1 c-1.202-0.628-4.441-3.698-7.725-12.1l-4.639-11.869c4.08,0.313,8.206,0.464,12.368,0.464c4.163,0,8.279-0.151,12.359-0.464 L263.732,476.632z M327.346,422.543c-1.878,1.113-3.792,2.192-5.728,3.212c-0.012,0-0.023,0.012-0.035,0.012 c-1.229,0.661-2.458,1.287-3.711,1.89c-18.68,9.207-39.679,14.378-61.861,14.378s-43.181-5.172-61.861-14.378 c-1.252-0.603-2.493-1.229-3.722-1.902c-0.012,0-0.012,0-0.012,0c-1.403-0.731-2.794-1.496-4.163-2.284 c-0.001,0-0.002-0.001-0.003-0.002l38.556-66.787h64.526l38.019,65.858C327.35,422.541,327.347,422.542,327.346,422.543z M309.421,345.094l33.347-57.753v-0.001h53.779v14.159c0,43.123-19.515,81.77-50.196,107.559 c-0.001,0.001-0.002,0.001-0.003,0.002L309.421,345.094z M405.708,407.875c12.882,12.871,12.882,33.824,0,46.695 c-6.227,6.238-14.529,9.671-23.341,9.671c-8.824,0-17.115-3.432-23.353-9.671l-15.044-15.036c0.001-0.001,0.003-0.002,0.005-0.003 c18.725-11.978,34.878-27.654,47.389-46.008L405.708,407.875z M433.815,161.184l-26.426,26.426 c-6.679-16.129-15.862-30.971-27.064-44.028l17.938-17.938c4.754-4.754,11.062-7.363,17.776-7.363s13.033,2.609,17.776,7.363 c4.742,4.743,7.363,11.05,7.363,17.764C441.178,150.122,438.557,156.441,433.815,161.184z"/></g></g><g><g><circle cx="102.311" cy="223.497" r="12.823"/></g></g><g><g><path d="M340.457,276.841c-5.842,0-10.58,4.738-10.58,10.58c0,5.842,4.738,10.58,10.58,10.58 c41.297,0,74.895,33.598,74.895,74.894c0,5.842,4.738,10.58,10.58,10.58s10.58-4.738,10.58-10.58 C436.512,319.931,393.423,276.841,340.457,276.841z"/></g></g>
</svg>`,
    'add_limit': `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 12H20M12 4V20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    'prev_page': `<svg class="svg-icon" viewBox="-0.5 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10.52 4.13998C11.25 4.35998 11.72 5.96 11.9 7.91C17.21 7.91 22 13.4802 22 20.0802C19.8 14.0802 15 12.45 11.86 12.45C11.65 14.21 11.2 15.6202 10.52 15.8202C8.41996 16.4302 2 12.4401 2 9.98006C2 7.52006 8.40996 3.52998 10.52 4.13998Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    'cycle_voice': `<svg class="svg-icon" viewBox="0 0 32.00 32.00" fill="none" xmlns="http://www.w3.org/2000/svg"><style type="text/css"> .st0{fill:none;stroke:currentColor;stroke-width:1.6776;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:10;} .st1{fill:none;stroke:currentColor;stroke-width:0.576;stroke-linejoin:round;stroke-miterlimit:10;} </style><path class="st0" d="M21,4c-2.2,0-4,1.8-4,4v6v4l6-3h3c2.2,0,4-1.8,4-4V8c0-2.2-1.8-4-4-4H21z"/><line class="st0" x1="21" y1="8" x2="24" y2="8"/><line class="st0" x1="21" y1="11" x2="22" y2="11"/><path class="st0" d="M17,8.8c-0.6-0.4-1.3-0.7-2-0.8c-1.6-0.2-3,0.5-3.9,1.7C10.4,9.5,9.8,9.6,9,10.2c-0.8,0.6-1.3,1.6-1.3,2.6 l0,0.8v1.2v1c0,1.8,0.9,3.5,2.4,4.4l0,0c0,1.8-1.3,3.4-3,3.8C5,24.7,3.4,26.3,3,28.5C3,28.7,3.2,29,3.4,29h18.1 c0.3,0,0.5-0.3,0.4-0.5c-0.4-2.1-2-3.8-4.1-4.4c-1.7-0.4-3-2-3-3.8"/></svg>`,
    'toggle_highlighter': `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15.24 2.82C15.93 2.13 17.06 2.13 17.75 2.82L21.18 6.25C21.87 6.94 21.87 8.07 21.18 8.76L9.61 20.33C9.37 20.57 9.06 20.73 8.72 20.79L3.5 21.75C3.06 21.83 2.65 21.52 2.58 21.08C2.56 20.98 2.56 20.87 2.6 20.77L3.92 15.65C4.01 15.31 4.2 15.01 4.46 14.77L15.24 2.82Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    'toggle_eraser': `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18.85 7.82L16.18 5.15C15.4 4.37 14.13 4.37 13.35 5.15L3.48 15.02C2.7 15.8 2.7 17.07 3.48 17.85L6.15 20.52C6.93 21.3 8.2 21.3 8.98 20.52L18.85 10.65C19.63 9.87 19.63 8.6 18.85 7.82Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.5 9.5L9.5 14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 20H22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    'crear_nota': `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11 4H4C3.44772 4 3 4.44772 3 5V20C3 20.5523 3.44772 21 4 21H19C19.5523 21 20 20.5523 20 20V13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M18.5 2.5C19.3284 1.67157 20.6716 1.67157 21.5 2.5C22.3284 3.32843 22.3284 4.67157 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    'toggle_notas': `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 3H17C18.1046 3 19 3.89543 19 5V19C19 20.1046 18.1046 21 17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 7H15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M9 11H15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M9 15H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M5 6H3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M5 10H3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M5 14H3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M5 18H3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    'capturar_recorte': `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 8V6C4 4.89543 4.89543 4 6 4H8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 4H18C19.1046 4 20 4.89543 20 6V8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M20 16V18C20 19.1046 19.1046 20 18 20H16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 20H6C4.89543 20 4 19.1046 4 18V16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg>`
};

function renderizarAtajos() {
    const lista = document.getElementById('listaAtajos'); 
    if(!lista) return;
    lista.innerHTML = ''; 
    for (let accion in misAtajos) {
        let div = document.createElement('div'); div.className = 'atajo-row';
        let textoAccion = translateDynamicText('atajo-' + accion);
        if (textoAccion === 'atajo-' + accion) textoAccion = nombresAcciones[accion] || accion;
        let iconSvg = atajosIcons[accion] || '';
        div.innerHTML = `<span style="display:flex; align-items:center; gap:8px;">${iconSvg} <span style="line-height:1.2;">${textoAccion}</span></span><button class="btn-binder" onclick="activarEscucha(this, '${accion}')">${formatearTecla(misAtajos[accion])}</button>`;
        lista.appendChild(div);
    }
}

function abrirConfiguracion() {
    renderizarAtajos();
    document.body.classList.add('modal-config-abierto');
    document.getElementById('modalConfig').style.display = 'flex';
}
function cerrarConfiguracion() { 
    if (typeof window._cancelarCapturaAtajo === 'function') window._cancelarCapturaAtajo();
    document.body.classList.remove('modal-config-abierto');
    document.getElementById('modalConfig').style.display = 'none'; 
    if (typeof guardarTodosAjustes === 'function') {
        guardarTodosAjustes(false);
    }
}
function activarEscucha(boton, accion) {
    if (typeof window._cancelarCapturaAtajo === 'function') {
        window._cancelarCapturaAtajo();
    }
    const textoOriginal = formatearTecla(misAtajos[accion]);
    boton.innerText = (typeof window.t === 'function') ? window.t('key-press', 'PRESIONA TECLA...') : "PRESIONA TECLA...";
    boton.classList.add("escuchando");

    function limpiar() {
        document.removeEventListener('keydown', capturar, true);
        document.removeEventListener('mousedown', cancelarPorClick, true);
        window.removeEventListener('blur', cancelar);
        if (window._cancelarCapturaAtajo === cancelar) window._cancelarCapturaAtajo = null;
    }

    function cancelar() {
        limpiar();
        boton.innerText = textoOriginal;
        boton.classList.remove("escuchando");
    }

    function cancelarPorClick(ev) {
        if (ev.target !== boton) {
            cancelar();
        }
    }

    function capturar(e) {
        e.preventDefault();
        e.stopPropagation();
        let teclas = [];
        if (e.ctrlKey) teclas.push("control");
        if (e.altKey) teclas.push("alt");
        if (e.shiftKey) teclas.push("shift");

        const esModificador = (e.key === "Control" || e.key === "Alt" || e.key === "Shift" || e.key === "Meta");
        if (esModificador) {
            const txtPresiona = (typeof window.t === 'function') ? window.t('key-press', 'PRESIONA TECLA...') : "PRESIONA TECLA...";
            boton.innerText = teclas.length ? (formatearTecla(teclas.join("+")) + " + ...") : txtPresiona;
            return;
        }

        teclas.push(e.key.toLowerCase());
        let nuevoAtajo = teclas.join("+");
        misAtajos[accion] = nuevoAtajo;
        limpiar();
        boton.innerText = formatearTecla(nuevoAtajo);
        boton.classList.remove("escuchando");
        eel.guardar_atajos_en_python(misAtajos);
        aplicarAtajosAlNavegador();
    }

    window._cancelarCapturaAtajo = cancelar;
    document.addEventListener('keydown', capturar, true);
    setTimeout(() => {
        document.addEventListener('mousedown', cancelarPorClick, true);
        window.addEventListener('blur', cancelar);
    }, 0);
}
function formatearTecla(combo) { 
    if (!combo) return translateDynamicText("key-unassigned") !== "key-unassigned" ? translateDynamicText("key-unassigned") : "SIN ASIGNAR"; 
    let formatted = combo.toUpperCase().replace("CONTROL", "CTRL");
    formatted = formatted.replace(" ", translateDynamicText("key-space") !== "key-space" ? translateDynamicText("key-space") : "ESPACIO");
    formatted = formatted.replace("ARROWUP", translateDynamicText("key-up") !== "key-up" ? translateDynamicText("key-up") : "ARRIBA");
    formatted = formatted.replace("ARROWDOWN", translateDynamicText("key-down") !== "key-down" ? translateDynamicText("key-down") : "ABAJO");
    formatted = formatted.replace("ARROWLEFT", translateDynamicText("key-left") !== "key-left" ? translateDynamicText("key-left") : "IZQ");
    formatted = formatted.replace("ARROWRIGHT", translateDynamicText("key-right") !== "key-right" ? translateDynamicText("key-right") : "DER");
    return formatted; 
}
function aplicarAtajosAlNavegador() {
    document.onkeydown = function(e) {
        // 0. Desactivar atajos si se está editando texto en el PDF (cuadro libre, FreeText, etc.)
        if (window.textoEditandoActivo) {
            return;
        }

        // 1. Manejo de inputs, textareas, elementos contenteditable y Escape
        const isEditable = e.target.tagName === 'INPUT' || 
                           e.target.tagName === 'TEXTAREA' || 
                           e.target.isContentEditable || 
                           e.target.getAttribute('contenteditable') === 'true' || 
                           (typeof e.target.closest === 'function' && e.target.closest('[contenteditable="true"]'));
                           
        if (isEditable) {
            if (e.key === "Escape") {
                cerrarModalesAbiertos();
                e.target.blur(); 
            }
            return;
        }

        // 2. Gatillo Universal Escape (fuera de inputs)
        if (e.key === "Escape") {
            e.preventDefault();
			cerrarBuscadorPDF();
            cerrarModalesAbiertos();
            return; // Detenemos aquí para no procesar combos vacíos
        }

        // 3. CONSTRUCCIÓN DEL COMBO (Orden Bayesiano)
        let combo = []; 
        if (e.ctrlKey) combo.push("control"); 
        if (e.altKey) combo.push("alt"); 
        if (e.shiftKey) combo.push("shift");
        
        // Solo agregamos la tecla si no es un modificador puro
        if (e.key !== "Control" && e.key !== "Alt" && e.key !== "Shift") {
            combo.push(e.key.toLowerCase());
        }

        // UNIFICACIÓN: Ahora sí generamos el string final para comparar
        let pulsado = combo.join("+");

        // 🛡️ ESCUDO DE PROCESAMIENTO: Si una página o el OCR se están procesando, ignorar atajos que cambien de página o inicien lectura
        if (typeof bloqueoCambioPagina !== 'undefined' && bloqueoCambioPagina) {
            if (pulsado === misAtajos.play_pause || pulsado === misAtajos.prev_page || pulsado === misAtajos.next_page || pulsado === misAtajos.prev_sentence || pulsado === misAtajos.next_sentence) {
                e.preventDefault();
                return;
            }
        }

        // 4. VERIFICACIÓN DE ATAJOS REGISTRADOS
        if (pulsado === misAtajos.play_pause) {
            e.preventDefault();
            if (typeof window.tutorialBloquearEspacio !== 'undefined' && window.tutorialBloquearEspacio) {
                return;
            }
            toggleLectura();
        }
        if (pulsado === misAtajos.add_limit) { e.preventDefault(); agregarCorteV(); }
        if (pulsado === misAtajos.add_abbr) { e.preventDefault(); agregarTerminoRapido(); } 
        if (pulsado === misAtajos.open_pdf) { e.preventDefault(); abrirBuscador(); }
        if (pulsado === misAtajos.toggle_dicc) { e.preventDefault(); toggleDiccionarioModal(); }
        if (pulsado === misAtajos.speed_up) { e.preventDefault(); cambiarValorInput('rng-velocidad', 0.1); }
        if (pulsado === misAtajos.speed_down) { e.preventDefault(); cambiarValorInput('rng-velocidad', -0.1); }
        if (pulsado === misAtajos.prev_page) { e.preventDefault(); cambiarPagina(-1); }
        if (pulsado === misAtajos.next_page) { e.preventDefault(); cambiarPagina(1); }
        if (pulsado === misAtajos.prev_sentence) { e.preventDefault(); navegarOracion(-1); }
        if (pulsado === misAtajos.next_sentence) { e.preventDefault(); navegarOracion(1); }
        if (pulsado === misAtajos.cycle_voice) { e.preventDefault(); ciclarVoz(); }
        if (pulsado === misAtajos.toggle_highlighter) {
            e.preventDefault();
            if (typeof toggleModoSubrayador === 'function') toggleModoSubrayador();
            if (typeof guardarTodosAjustes === 'function') guardarTodosAjustes();
        }
        if (pulsado === misAtajos.toggle_eraser) {
            e.preventDefault();
            if (typeof toggleModoBorrador === 'function') toggleModoBorrador();
            if (typeof guardarTodosAjustes === 'function') guardarTodosAjustes();
        }
        if (pulsado === misAtajos.crear_nota) {
            e.preventDefault();
            if (typeof togglePanelNotaRapida === 'function') togglePanelNotaRapida();
        }
        if (pulsado === misAtajos.toggle_notas) {
            e.preventDefault();
            if (typeof toggleModalNotas === 'function') toggleModalNotas();
        }
        if (pulsado === misAtajos.capturar_recorte) {
            e.preventDefault();
            if (typeof toggleModoRecorteExtraccion === 'function') toggleModoRecorteExtraccion();
        }
    };
}
function navegarOracion(delta) {
    if (!datosPagina || !datosPagina.oraciones) return;
    if (indiceOracion === -1) { if (delta > 0) reproducirSecuencia(0); else reproducirSecuencia(datosPagina.oraciones.length - 1); return; }
    let nuevoIndice = indiceOracion + delta;
    if (nuevoIndice >= 0 && nuevoIndice < datosPagina.oraciones.length) { 
        
        // 1. FRENO DE MANO: Apagamos bandera de lectura y forzamos detención (Imitando Pausa/Stop)
        leyendo = false;
        if (typeof detenerLectura === "function") detenerLectura(false);
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        
        // 2. INICIO SEGURO: Encendemos bandera e iniciamos nuevo texto
        leyendo = true; 
        reproducirSecuencia(nuevoIndice); 
    }
}
function ciclarVoz() {
    let sel = document.getElementById('selector-voz-live'); 
	if (sel.options.length < 2) return; 
	
    let nuevoIndex = sel.selectedIndex + 1; 
	if (nuevoIndex >= sel.options.length) nuevoIndex = 0; 
    if (sel.options[nuevoIndex].disabled) { nuevoIndex++; if (nuevoIndex >= sel.options.length) nuevoIndex = 0; }
    sel.selectedIndex = nuevoIndex; cambiarVozLive(); 
    let btn = document.getElementById('texto-lectura');
	let original = btn.innerHTML; 
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg> ${nombreVoz}`; 
	setTimeout(() => { if(!leyendo) btn.innerHTML = original; }, 1500);
}
function toggleDiccionarioModal() { let panel = document.getElementById('modal-diccionario'); if (panel.style.display === 'flex') cerrarDiccionario(); else abrirDiccionario(); }
function agregarTerminoRapido() { abrirDiccionario(); setTimeout(() => document.getElementById('input-sigla').focus(), 100); }

// ==========================================
