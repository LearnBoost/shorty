
# Shorty

Shorty is LearnBoost's URL shortening/redirection service.

## Features

- Redis backed
- Super fast
- At production use on https://lrn.bt
- Uses express, jade, stylus. Easy to hack on!
- Realtime stats with [socket.io](http://socket.io)
 - **/**
 ![](http://f.cl.ly/items/2h2k1p1b2E1I2y0N0Y3u/Image%202011.09.21%208:49:42%20PM.png)
 - **/stats**
 ![](http://f.cl.ly/items/072u3V453Q2X0p44180J/Image%202011.09.21%208:16:26%20PM.png)

## API

Post to `/create` with the `url` field to create.

- If a field is missing or incorrect, status `400` is returned with a JSON
body (`error` key)
- If a problem saving the URL occurs, a status `500` is returned.
- If the url is created, status `200` is returned with JSON body (`short` key)
- If the url already exists, same response as creation is returned.

## Credits

(The MIT License)

Copyright (c) 2011 Guillermo Rauch &lt;guillermo@learnboost.com&gt;

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### 3rd-party

- Base60k library by Tantek Çelik
- Icon by David Renelt for non-commercial use
(http://www.iconarchive.com/show/little-icon-people-icons-by-david-renelt.html)
