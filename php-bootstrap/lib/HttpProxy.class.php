<?php

class HttpProxy
{
	static public $sourceInterface = null; // string=hostname or IP, null=http hostname, false=let cURL pick

	static public $defaultPassthruHeaders = array(
		'/^HTTP\//'
		,'/^Content-Type:/'
		,'/^X-Powered-By:/'
		,'/^Server:/'
		,'/^Date:/'
		,'/^Set-Cookie:/'
		,'/^Location:/'
		,'/^ETag:/'
		,'/^Last-Modified:/'
		,'/^Author:/'
	);
	
	static public $defaultForwardHeaders = array(
		'Content-Type'
		,'User-Agent'
		,'Accept'
		,'Accept-Charset'
		,'Accept-Language'
	);

	static public function relayRequest($options)
	{
		if (is_string($options)) {
			$options = array('url' => $options);
        }
        
		if (!isset($options['headers'])) {
			$options['headers'] = array();
        }

		if (!isset($options['passthruHeaders'])) {
			$options['passthruHeaders'] = static::$defaultPassthruHeaders;
        }
        
		if (!isset($options['forwardHeaders'])) {
			$options['forwardHeaders'] = static::$defaultForwardHeaders;
        }

		if (!isset($options['interface'])) {
			$options['interface'] = isset(static::$sourceInterface) ? static::$sourceInterface : $_SERVER['HTTP_HOST'];
        }

		// build URL
		$baseUrl = $options['url'];
		if (!empty(Site::$pathStack) && (!isset($options['autoAppend']) || $options['autoAppend'] != false)) {
			$options['url'] .= '/' . implode('/', Site::$pathStack);
        }

		// get cookies
		if (!isset($options['cookies'])) {
			$options['cookies'] = $_COOKIE;
        }

		// add query string
		if (!empty($_SERVER['QUERY_STRING']) && (!isset($options['autoQuery']) || $options['autoQuery'] != false)) {
			$options['url'] .= '?' . $_SERVER['QUERY_STRING'];
        }

		// build headers
		foreach ($options['forwardHeaders'] AS $header) {
			$headerKey = 'HTTP_' . str_replace('-', '_', strtoupper($header));
			
			if (!empty($_SERVER[$headerKey])) {
				$options['headers'][] = $header . ': ' . $_SERVER[$headerKey];
			}
		}

		if (!empty($_GET['proxy-debug'])) {
			if ($_GET['proxy-debug'] == 1) {
				$options['debug'] = true;
            } else {
				$_GET['proxy-debug']--;
            }
		}

		// initialize and configure cURL
		$ch = curl_init();

		if ($_SERVER['REQUEST_METHOD'] == 'POST') {
			curl_setopt($ch, CURLOPT_POST, true);
			curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
		} elseif ($_SERVER['REQUEST_METHOD'] == 'PUT') {
			curl_setopt($ch, CURLOPT_PUT, true);
			curl_setopt($ch, CURLOPT_INFILE, fopen('php://input', 'r'));
		} elseif ($_SERVER['REQUEST_METHOD'] != 'GET') {
			curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']); 
		}
			
        if (isset($options['timeout'])) {
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 0);
            curl_setopt($ch, CURLOPT_TIMEOUT, $options['timeout']);
        }

		if (!empty($options['debug'])) {
			curl_setopt($ch, CURLOPT_VERBOSE, true);
			curl_setopt($ch, CURLOPT_HEADER, true);
			curl_setopt($ch, CURLINFO_HEADER_OUT, true);
			
			print('<h1>Options</h1><pre>');
			print_r($options);
			print('</pre>');
		} elseif (!empty($options['returnBody']) && !empty($options['returnHeader'])) {
			curl_setopt($ch, CURLOPT_HEADER, true);
		} else {
                        $responseHeaders = array();
			curl_setopt($ch, CURLOPT_HEADER, false);
			curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($ch, $header) use($options, &$responseHeaders) {
                                list($headerKey, $headerValue) = preg_split('/:\s*/', $header, 2);
				if ($headerValue) {
					$responseHeaders[$headerKey] = trim($headerValue);
				}

				foreach ($options['passthruHeaders'] AS $pattern) {
					if (preg_match($pattern, $header)) {
						// apply header transformation
						if (!empty($options['headerTransformer'])) {
							$header = call_user_func($options['headerTransformer'], $header);
							
							if ($header === false) {
								return 0;
							}
						}
						
						if (!empty($options['debug'])) {
							print("<p>Response Header: $header</p>");
						} else {
							header($header);
	                    }
	                    
						return strlen($header);
					}
				}
	
				return strlen($header);
			});
		}

		curl_setopt($ch, CURLOPT_URL, $options['url']);
		curl_setopt($ch, CURLOPT_HTTPHEADER, $options['headers']);
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
		curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
		curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
		curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
		
		if (!empty($options['interface'])) {
			curl_setopt($ch, CURLOPT_INTERFACE, $options['interface']);
		}

		if (!empty($options['cookies'])) {
			$cookieStr = implode('; ', array_map(function($key, $value) {
				return $key.'='.urlencode($value);
			}, array_keys($options['cookies']), $options['cookies']));

			curl_setopt($ch, CURLOPT_COOKIE, $cookieStr);
		}
		
		if (!empty($options['referer'])) {
			curl_setopt($ch, CURLOPT_REFERER, is_string($options['referer']) ? $options['referer'] : $baseUrl);
		}
		
		$responseBody = curl_exec($ch);

		// apply body transformation
		if (!empty($options['bodyTransformer'])) {
			$responseBody = call_user_func($options['bodyTransformer'], $responseBody);
        }
        
		// output debug information or raw response body
		if (!empty($options['debug'])) {			
			print('<h1>Response Info</h1><pre>');
			print_r(curl_getinfo($ch));
                        print('</pre>');
			print('<h1>cURL error</h1><pre>'.var_export(curl_error($ch), true).'</pre>');
			print('<h1>Response Length</h1>'.strlen($responseBody));
			print('<h1>Response Body</h1><pre>');
			print(htmlspecialchars($responseBody));
			print('</pre>');
		} elseif (!empty($options['returnBody'])) {
			curl_close($ch);
			return $responseBody;
		} elseif ($responseBody !== false) {
			header('Content-Length: '.strlen($responseBody));
			print($responseBody);
		} else {
			header('HTTP/1.1 502 Bad Gateway');
		}
		
		if (empty($options['afterResponseSync'])) {
			fastcgi_finish_request();
		}

		if (is_callable($options['afterResponse'])) {
			call_user_func($options['afterResponse'], $responseBody, $responseHeaders, $options, $ch);
        }

		curl_close($ch);
		
		exit();
	}

}
